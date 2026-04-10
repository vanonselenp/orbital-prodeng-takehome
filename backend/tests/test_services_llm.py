from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

from takehome.services.llm import (
    REFUSAL_MESSAGE,
    CitationContext,
    MAX_DOCUMENT_TEXT_LENGTH,
    _truncate_documents,
    build_grounded_response,
    chat_with_documents,
    generate_title,
    parse_citation_candidates,
)


def test_parse_citation_candidates_without_block():
    answer, citations = parse_citation_candidates("No citations here.")

    assert answer == "No citations here."
    assert citations == []


def test_parse_citation_candidates_extracts_machine_readable_block():
    response = (
        "The lease requires landlord consent.\n"
        "<citations>"
        '[{"filename":"lease.pdf","page":3}]'
        "</citations>"
    )

    answer, citations = parse_citation_candidates(response)

    assert answer == "The lease requires landlord consent."
    assert citations == [{"filename": "lease.pdf", "page": 3}]


def test_parse_citation_candidates_malformed_block_is_ignored():
    response = "Answer<citationz></citationz><citations>{bad json}</citations>"

    answer, citations = parse_citation_candidates(response)

    assert answer == "Answer<citationz></citationz>"
    assert citations == []


def test_parse_citation_candidates_non_list_block_is_ignored():
    response = 'Answer<citations>{"filename":"lease.pdf","page":3}</citations>'

    answer, citations = parse_citation_candidates(response)

    assert answer == "Answer"
    assert citations == []


def test_build_grounded_response_keeps_valid_citations():
    answer, citations = build_grounded_response(
        (
            "The assignment clause needs consent.\n"
            '<citations>[{"filename":"lease.pdf","page":2}]</citations>'
        ),
        documents=[CitationContext(document_id="doc-1", filename="lease.pdf", page_count=5)],
    )

    assert answer == "The assignment clause needs consent."
    assert citations == [
        {
            "document_id": "doc-1",
            "filename": "lease.pdf",
            "page": 2,
            "label": "lease.pdf p.2",
        }
    ]


def test_build_grounded_response_drops_unknown_filename(caplog):
    answer, citations = build_grounded_response(
        'Answer<citations>[{"filename":"missing.pdf","page":1}]</citations>',
        documents=[CitationContext(document_id="doc-1", filename="lease.pdf", page_count=5)],
    )

    assert answer == REFUSAL_MESSAGE
    assert citations == []
    assert "unknown_filename" in caplog.text


def test_build_grounded_response_drops_non_integer_page(caplog):
    answer, citations = build_grounded_response(
        'Answer<citations>[{"filename":"lease.pdf","page":"2"}]</citations>',
        documents=[CitationContext(document_id="doc-1", filename="lease.pdf", page_count=5)],
    )

    assert answer == REFUSAL_MESSAGE
    assert citations == []
    assert "invalid_page" in caplog.text


def test_build_grounded_response_drops_out_of_range_page(caplog):
    answer, citations = build_grounded_response(
        'Answer<citations>[{"filename":"lease.pdf","page":9}]</citations>',
        documents=[CitationContext(document_id="doc-1", filename="lease.pdf", page_count=5)],
    )

    assert answer == REFUSAL_MESSAGE
    assert citations == []
    assert "page_out_of_range" in caplog.text


def test_build_grounded_response_refuses_when_no_valid_citations():
    answer, citations = build_grounded_response("Unsupported answer", documents=[])

    assert answer == REFUSAL_MESSAGE
    assert citations == []


@patch("takehome.services.llm.agent")
async def test_generate_title(mock_agent):
    mock_result = AsyncMock()
    mock_result.output = '"Lease Review Questions"'
    mock_agent.run = AsyncMock(return_value=mock_result)

    title = await generate_title("What are the key terms in this lease?")
    assert title == "Lease Review Questions"
    mock_agent.run.assert_called_once()


@patch("takehome.services.llm.agent")
async def test_generate_title_truncation(mock_agent):
    mock_result = AsyncMock()
    mock_result.output = "A" * 150
    mock_agent.run = AsyncMock(return_value=mock_result)

    title = await generate_title("some message")
    assert len(title) == 100
    assert title.endswith("...")


# --------------------------------------------------------------------------- #
# chat_with_documents — async streaming
# --------------------------------------------------------------------------- #


def _make_streaming_agent(chunks: list[str]) -> MagicMock:
    """Build a mock agent whose run_stream yields the given chunks."""

    async def fake_stream_text(delta: bool = True):
        for c in chunks:
            yield c

    fake_result = MagicMock()
    fake_result.stream_text = fake_stream_text

    @asynccontextmanager
    async def fake_run_stream(prompt: str):
        yield fake_result

    mock = MagicMock()
    mock.run_stream = fake_run_stream
    return mock


@patch("takehome.services.llm.agent")
async def test_chat_with_documents_multi_document(mock_agent):
    """Multi-document prompt has multiple <document> blocks with correct filenames."""
    captured_prompts: list[str] = []

    async def fake_stream_text(delta: bool = True):
        yield "response"

    fake_result = MagicMock()
    fake_result.stream_text = fake_stream_text

    @asynccontextmanager
    async def capturing_run_stream(prompt: str):
        captured_prompts.append(prompt)
        yield fake_result

    mock_agent.run_stream = capturing_run_stream

    chunks = []
    async for chunk in chat_with_documents(
        user_message="Compare these docs",
        documents=[
            ("lease.pdf", "Lease content here"),
            ("deed.pdf", "Deed content here"),
        ],
        conversation_history=[],
    ):
        chunks.append(chunk)

    assert chunks == ["response"]
    prompt = captured_prompts[0]
    assert '<document filename="lease.pdf">' in prompt
    assert '<document filename="deed.pdf">' in prompt
    assert "Lease content here" in prompt
    assert "Deed content here" in prompt
    assert "<citations>" in prompt


@patch("takehome.services.llm.agent")
async def test_chat_with_documents_single_document(mock_agent):
    """Single document still works (backward compatible prompt structure)."""
    mock_agent.run_stream = _make_streaming_agent(["Hello ", "world"]).run_stream

    chunks = []
    async for chunk in chat_with_documents(
        user_message="What is this?",
        documents=[("lease.pdf", "This is a lease document.")],
        conversation_history=[],
    ):
        chunks.append(chunk)

    assert chunks == ["Hello ", "world"]


@patch("takehome.services.llm.agent")
async def test_chat_with_documents_empty_list(mock_agent):
    """Empty documents list produces upload-prompt message."""
    captured_prompts: list[str] = []

    async def fake_stream_text(delta: bool = True):
        yield "ok"

    fake_result = MagicMock()
    fake_result.stream_text = fake_stream_text

    @asynccontextmanager
    async def capturing_run_stream(prompt: str):
        captured_prompts.append(prompt)
        yield fake_result

    mock_agent.run_stream = capturing_run_stream

    chunks = []
    async for chunk in chat_with_documents(
        user_message="hi",
        documents=[],
        conversation_history=[],
    ):
        chunks.append(chunk)

    assert chunks == ["ok"]
    assert "No document has been uploaded" in captured_prompts[0]


@patch("takehome.services.llm.agent")
async def test_chat_with_documents_with_history(mock_agent):
    mock_agent.run_stream = _make_streaming_agent(["response"]).run_stream

    history = [
        {"role": "user", "content": "earlier question"},
        {"role": "assistant", "content": "earlier answer"},
        {"role": "system", "content": "ignored role"},
    ]
    chunks = []
    async for chunk in chat_with_documents(
        user_message="follow up",
        documents=[("doc.pdf", "doc content")],
        conversation_history=history,
    ):
        chunks.append(chunk)

    assert chunks == ["response"]


# --------------------------------------------------------------------------- #
# truncation logic
# --------------------------------------------------------------------------- #


def test_truncation_triggers_when_exceeding_limit():
    """Truncation triggers when total text exceeds 150000 chars, largest doc is truncated."""
    large_text = "x" * 100000
    small_text = "y" * 60000
    documents = [("large.pdf", large_text), ("small.pdf", small_text)]

    result = _truncate_documents(documents)

    # Total should now be <= MAX_DOCUMENT_TEXT_LENGTH
    total = sum(len(text) for _, text in result)
    assert total <= MAX_DOCUMENT_TEXT_LENGTH

    # The large doc should be truncated
    assert "[Document truncated due to length]" in result[0][1]
    # The small doc should be unchanged
    assert result[1][1] == small_text


def test_truncation_no_change_when_under_limit():
    """No truncation when total text is under the limit."""
    documents = [("a.pdf", "short"), ("b.pdf", "also short")]
    result = _truncate_documents(documents)
    assert result == documents


def test_truncation_full_replacement_branch():
    """When excess >= len(text) - notice_len, the entire doc is replaced with notice."""
    # 3 docs of 100k each = 300k total. Limit = 150k. Excess = 150k.
    # Largest doc: 100k. excess(150k) >= 100k - 35 = 99965 → yes → full replacement.
    big_text = "z" * 100000
    documents = [("a.pdf", big_text), ("b.pdf", big_text), ("c.pdf", big_text)]

    result = _truncate_documents(documents)

    total = sum(len(text) for _, text in result)
    assert total <= MAX_DOCUMENT_TEXT_LENGTH

    # At least one doc should have been fully replaced (no partial content)
    fully_replaced = [
        fname for fname, text in result if text == "[Document truncated due to length]"
    ]
    assert len(fully_replaced) >= 1


def test_truncation_total_accounting_is_exact():
    """After truncation the reported total exactly matches actual text lengths.

    Regression: the full-replacement branch used a hardcoded string length that
    differed from the truncation_notice variable by 1 (leading newline), causing
    the running total to drift from reality.
    """
    # Two docs: 80k + 80k = 160k, excess = 10k. Only partial truncation of the first.
    text_a = "a" * 80000
    text_b = "b" * 80000
    documents = [("a.pdf", text_a), ("b.pdf", text_b)]

    result = _truncate_documents(documents)

    actual_total = sum(len(text) for _, text in result)
    assert actual_total <= MAX_DOCUMENT_TEXT_LENGTH
    # The result should be as close to MAX as possible (no undershoot beyond notice_len)
    assert actual_total >= MAX_DOCUMENT_TEXT_LENGTH - 100
