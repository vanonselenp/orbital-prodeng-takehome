from __future__ import annotations

import re
from collections.abc import AsyncIterator

from pydantic_ai import Agent

from takehome.config import settings  # noqa: F401 — triggers ANTHROPIC_API_KEY export

MAX_DOCUMENT_TEXT_LENGTH = 150000

agent = Agent(
    "anthropic:claude-haiku-4-5-20251001",
    system_prompt=(
        "You are a helpful legal document assistant for commercial real estate lawyers. "
        "You help lawyers review and understand documents during due diligence.\n\n"
        "IMPORTANT INSTRUCTIONS:\n"
        "- Answer questions based on the document content provided.\n"
        "- When referencing specific parts of a document, always cite the document filename "
        "alongside the page number (e.g. 'In lease.pdf, page 3...').\n"
        "- If multiple documents are provided, note cross-document observations such as "
        "conflicts, related clauses across files, or complementary information.\n"
        "- If the answer is not in the documents, say so clearly. Do not fabricate information.\n"
        "- Be concise and precise. Lawyers value accuracy over verbosity.\n"
        "- When you reference specific content, mention the filename, section, clause, or page."
    ),
)


async def generate_title(user_message: str) -> str:
    """Generate a 3-5 word conversation title from the first user message."""
    result = await agent.run(
        f"Generate a concise 3-5 word title for a conversation that starts with: '{user_message}'. "
        "Return only the title, nothing else."
    )
    title = str(result.output).strip().strip('"').strip("'")
    # Truncate if too long
    if len(title) > 100:
        title = title[:97] + "..."
    return title


def _truncate_documents(documents: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Truncate the largest documents if total text exceeds MAX_DOCUMENT_TEXT_LENGTH."""
    total = sum(len(text) for _, text in documents)
    if total <= MAX_DOCUMENT_TEXT_LENGTH:
        return documents

    full_notice = "[Document truncated due to length]"
    partial_notice = "\n" + full_notice
    partial_notice_len = len(partial_notice)

    # Sort by text length descending to truncate largest first
    indexed = list(enumerate(documents))
    indexed.sort(key=lambda item: len(item[1][1]), reverse=True)

    result = list(documents)
    for idx, (filename, text) in indexed:
        if total <= MAX_DOCUMENT_TEXT_LENGTH:
            break
        excess = total - MAX_DOCUMENT_TEXT_LENGTH
        if excess >= len(text) - len(full_notice):
            # Replace entire doc content with just the notice
            result[idx] = (filename, full_notice)
            total -= len(text) - len(full_notice)
        else:
            # Truncate from the end, accounting for the notice length
            keep = len(text) - excess - partial_notice_len
            if (
                keep < 0
            ):  # pragma: no cover — algebraically unreachable: else branch guarantees keep > 0
                keep = 0
            new_text = text[:keep] + partial_notice
            total -= len(text) - len(new_text)
            result[idx] = (filename, new_text)

    return result


async def chat_with_documents(
    user_message: str,
    documents: list[tuple[str, str]],
    conversation_history: list[dict[str, str]],
) -> AsyncIterator[str]:
    """Stream a response to the user's message, yielding text chunks.

    Builds a prompt that includes document context and conversation history,
    then streams the response from the LLM.
    """
    # Build the full prompt with context
    prompt_parts: list[str] = []

    # Add document context if available
    if documents:
        truncated = _truncate_documents(documents)
        prompt_parts.append("The following are the documents being discussed:\n\n")
        for filename, text in truncated:
            prompt_parts.append(f'<document filename="{filename}">\n{text}\n</document>\n')
    else:
        prompt_parts.append(
            "No document has been uploaded yet. If the user asks about a document, "
            "let them know they need to upload one first.\n"
        )

    # Add conversation history
    if conversation_history:
        prompt_parts.append("Previous conversation:\n")
        for msg in conversation_history:
            role = msg["role"]
            content = msg["content"]
            if role == "user":
                prompt_parts.append(f"User: {content}\n")
            elif role == "assistant":
                prompt_parts.append(f"Assistant: {content}\n")
        prompt_parts.append("\n")

    # Add the current user message
    prompt_parts.append(f"User: {user_message}")

    full_prompt = "\n".join(prompt_parts)

    async with agent.run_stream(full_prompt) as result:
        async for text in result.stream_text(delta=True):
            yield text


def count_sources_cited(response: str) -> int:
    """Count the number of references to document sections, clauses, pages, etc."""
    patterns = [
        r"section\s+\d+",
        r"clause\s+\d+",
        r"page\s+\d+",
        r"paragraph\s+\d+",
    ]
    count = 0
    for pattern in patterns:
        count += len(re.findall(pattern, response, re.IGNORECASE))
    return count
