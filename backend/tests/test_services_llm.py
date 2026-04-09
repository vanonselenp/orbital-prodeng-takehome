from __future__ import annotations

from unittest.mock import AsyncMock, patch

from takehome.services.llm import count_sources_cited, generate_title


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
