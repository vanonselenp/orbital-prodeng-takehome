"""Unit tests for message router endpoints (direct-call, see conversations test note)."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from takehome.db.models import Document, Message
from takehome.services.conversation import create_conversation
from takehome.web.routers.messages import MessageCreate, list_messages, send_message


async def test_list_messages_empty(db_session):
    conv = await create_conversation(db_session)
    result = await list_messages(conversation_id=conv.id, session=db_session)
    assert result == []


async def test_list_messages_with_data(db_session):
    conv = await create_conversation(db_session)
    db_session.add(Message(conversation_id=conv.id, role="user", content="Hello"))
    db_session.add(Message(conversation_id=conv.id, role="assistant", content="Hi"))
    await db_session.commit()

    result = await list_messages(conversation_id=conv.id, session=db_session)
    assert len(result) == 2
    assert result[0].role == "user"
    assert result[1].role == "assistant"


async def test_list_messages_conversation_not_found(db_session):
    with pytest.raises(HTTPException) as exc:
        await list_messages(conversation_id="nonexistent", session=db_session)
    assert exc.value.status_code == 404


# --------------------------------------------------------------------------- #
# send_message — the SSE streaming endpoint
# --------------------------------------------------------------------------- #


async def _collect_stream(response):
    """Drain a StreamingResponse body iterator into a list of events."""
    events = []
    async for chunk in response.body_iterator:
        text = chunk.decode() if isinstance(chunk, bytes) else chunk
        for line in text.strip().split("\n\n"):
            if line.startswith("data: "):
                events.append(json.loads(line[len("data: "):]))
    return events


async def _fake_chat_stream(user_message, document_text, conversation_history):
    """Fake chat_with_document that yields canned chunks mentioning section 1."""
    for chunk in ["Based on ", "section 1", " of the document, ", "the answer is yes."]:
        yield chunk


async def test_send_message_conversation_not_found(db_session):
    body = MessageCreate(content="hello")
    with pytest.raises(HTTPException) as exc:
        await send_message(conversation_id="nonexistent", body=body, session=db_session)
    assert exc.value.status_code == 404


@patch("takehome.web.routers.messages.generate_title", new_callable=AsyncMock)
@patch("takehome.web.routers.messages.chat_with_document", side_effect=_fake_chat_stream)
async def test_send_message_first_message_generates_title(
    mock_chat, mock_title, db_session, monkeypatch
):
    mock_title.return_value = "Generated Title"

    # Patch async_session to return a session bound to the same in-memory engine
    from takehome.db.session import async_session as real_factory
    from takehome.web.routers import messages as msg_module

    from sqlalchemy.ext.asyncio import async_sessionmaker

    test_factory = async_sessionmaker(
        db_session.bind, expire_on_commit=False
    )
    monkeypatch.setattr("takehome.db.session.async_session", test_factory)

    conv = await create_conversation(db_session)
    body = MessageCreate(content="What does section 1 say?")

    response = await send_message(conversation_id=conv.id, body=body, session=db_session)
    events = await _collect_stream(response)

    # Should have content events, a message event, and a done event
    content_events = [e for e in events if e["type"] == "content"]
    message_events = [e for e in events if e["type"] == "message"]
    done_events = [e for e in events if e["type"] == "done"]

    assert len(content_events) == 4  # four chunks from our fake
    assert len(message_events) == 1
    assert len(done_events) == 1
    assert done_events[0]["sources_cited"] == 1  # "section 1" matches
    assert message_events[0]["message"]["sources_cited"] == 1

    # Title should have been generated (first user message)
    mock_title.assert_called_once_with("What does section 1 say?")


@patch("takehome.web.routers.messages.generate_title", new_callable=AsyncMock)
@patch("takehome.web.routers.messages.chat_with_document", side_effect=_fake_chat_stream)
async def test_send_message_subsequent_message_no_title(
    mock_chat, mock_title, db_session, monkeypatch
):
    from sqlalchemy.ext.asyncio import async_sessionmaker

    test_factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    monkeypatch.setattr("takehome.db.session.async_session", test_factory)

    conv = await create_conversation(db_session)
    # Seed a prior user message so this one is NOT the first
    db_session.add(Message(conversation_id=conv.id, role="user", content="earlier"))
    db_session.add(Message(conversation_id=conv.id, role="assistant", content="earlier reply"))
    await db_session.commit()

    body = MessageCreate(content="follow up")
    response = await send_message(conversation_id=conv.id, body=body, session=db_session)
    await _collect_stream(response)

    mock_title.assert_not_called()


@patch("takehome.web.routers.messages.generate_title", new_callable=AsyncMock)
@patch("takehome.web.routers.messages.chat_with_document", side_effect=_fake_chat_stream)
async def test_send_message_with_document(
    mock_chat, mock_title, db_session, monkeypatch
):
    from sqlalchemy.ext.asyncio import async_sessionmaker

    test_factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    monkeypatch.setattr("takehome.db.session.async_session", test_factory)
    mock_title.return_value = "T"

    conv = await create_conversation(db_session)
    db_session.add(
        Document(
            conversation_id=conv.id,
            filename="lease.pdf",
            file_path="/tmp/lease.pdf",
            extracted_text="Section 1: This is a lease.",
            page_count=1,
        )
    )
    await db_session.commit()

    body = MessageCreate(content="What is this?")
    response = await send_message(conversation_id=conv.id, body=body, session=db_session)
    await _collect_stream(response)

    # Verify chat_with_document was called with the document text
    call_kwargs = mock_chat.call_args.kwargs
    assert call_kwargs["document_text"] == "Section 1: This is a lease."


async def _failing_chat_stream(user_message, document_text, conversation_history):
    raise RuntimeError("LLM exploded")
    yield  # unreachable, makes this an async generator


@patch("takehome.web.routers.messages.generate_title", new_callable=AsyncMock)
@patch("takehome.web.routers.messages.chat_with_document", side_effect=_failing_chat_stream)
async def test_send_message_llm_error_handled(
    mock_chat, mock_title, db_session, monkeypatch
):
    from sqlalchemy.ext.asyncio import async_sessionmaker

    test_factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    monkeypatch.setattr("takehome.db.session.async_session", test_factory)
    mock_title.return_value = "T"

    conv = await create_conversation(db_session)
    body = MessageCreate(content="trigger failure")

    response = await send_message(conversation_id=conv.id, body=body, session=db_session)
    events = await _collect_stream(response)

    content_events = [e for e in events if e["type"] == "content"]
    assert len(content_events) == 1
    assert "error occurred" in content_events[0]["content"]


@patch("takehome.web.routers.messages.generate_title", new_callable=AsyncMock)
@patch("takehome.web.routers.messages.chat_with_document", side_effect=_fake_chat_stream)
async def test_send_message_title_generation_failure_is_swallowed(
    mock_chat, mock_title, db_session, monkeypatch
):
    from sqlalchemy.ext.asyncio import async_sessionmaker

    test_factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    monkeypatch.setattr("takehome.db.session.async_session", test_factory)
    mock_title.side_effect = RuntimeError("title fail")

    conv = await create_conversation(db_session)
    body = MessageCreate(content="first message")

    # Should not raise even though title generation failed
    response = await send_message(conversation_id=conv.id, body=body, session=db_session)
    events = await _collect_stream(response)

    done = [e for e in events if e["type"] == "done"]
    assert len(done) == 1
