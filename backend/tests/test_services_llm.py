from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

from takehome.services.llm import chat_with_document, count_sources_cited, generate_title


def test_count_sources_cited_no_matches():
    assert count_sources_cited("") == 0
    assert count_sources_cited("No references here.") == 0


def test_count_sources_cited_section_references():
    assert count_sources_cited("See section 3 and section 12") == 2


def test_count_sources_cited_mixed_references():
    text = "section 1, clause 2, page 3, paragraph 4"
    assert count_sources_cited(text) == 4


def test_count_sources_cited_case_insensitive():
    text = "Section 1 and CLAUSE 2 and Page 5"
    assert count_sources_cited(text) == 3


def test_count_sources_cited_no_number():
    assert count_sources_cited("see the section about liability") == 0
    assert count_sources_cited("the clause regarding indemnity") == 0


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
# chat_with_document — async streaming
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
async def test_chat_with_document_with_document_text(mock_agent):
    mock_agent.run_stream = _make_streaming_agent(["Hello ", "world"]).run_stream

    chunks = []
    async for chunk in chat_with_document(
        user_message="What is this?",
        document_text="This is a lease document.",
        conversation_history=[],
    ):
        chunks.append(chunk)

    assert chunks == ["Hello ", "world"]


@patch("takehome.services.llm.agent")
async def test_chat_with_document_no_document(mock_agent):
    mock_agent.run_stream = _make_streaming_agent(["ok"]).run_stream

    chunks = []
    async for chunk in chat_with_document(
        user_message="hi",
        document_text=None,
        conversation_history=[],
    ):
        chunks.append(chunk)

    assert chunks == ["ok"]


@patch("takehome.services.llm.agent")
async def test_chat_with_document_with_history(mock_agent):
    mock_agent.run_stream = _make_streaming_agent(["response"]).run_stream

    history = [
        {"role": "user", "content": "earlier question"},
        {"role": "assistant", "content": "earlier answer"},
        {"role": "system", "content": "ignored role"},
    ]
    chunks = []
    async for chunk in chat_with_document(
        user_message="follow up",
        document_text="doc",
        conversation_history=history,
    ):
        chunks.append(chunk)

    assert chunks == ["response"]
