"""Unit tests for message router endpoints (direct-call, see conversations test note)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from takehome.db.models import Document, Message
from takehome.services.conversation import create_conversation
from takehome.web.routers.messages import MessageCreate, list_messages, send_message

REFUSAL_MESSAGE = "I can't answer that from the uploaded documents with a verifiable page citation."


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
                events.append(json.loads(line[len("data: ") :]))
    return events


async def _fake_chat_stream(user_message, documents, conversation_history):
    """Fake chat_with_documents that yields text without valid citations."""
    for chunk in [
        "Based on lease.pdf page 1, ",
        "the answer is yes.\n",
        '<citations>[{"filename":"lease.pdf","page":1}]</citations>',
    ]:
        yield chunk


async def _fake_grounded_chat_stream(user_message, documents, conversation_history):
    """Fake chat_with_documents that yields text with a valid citation block."""
    for chunk in [
        "Based on lease.pdf page 1, ",
        "the answer is yes.\n",
        '<citations>[{"filename":"lease.pdf","page":1}]</citations>',
    ]:
        yield chunk


async def test_send_message_conversation_not_found(db_session):
    body = MessageCreate(content="hello")
    with pytest.raises(HTTPException) as exc:
        await send_message(conversation_id="nonexistent", body=body, session=db_session)
    assert exc.value.status_code == 404


@patch("takehome.web.routers.messages.generate_title", new_callable=AsyncMock)
@patch("takehome.web.routers.messages.chat_with_documents", side_effect=_fake_chat_stream)
async def test_send_message_first_message_generates_title(
    mock_chat, mock_title, db_session, monkeypatch
):
    mock_title.return_value = "Generated Title"

    from sqlalchemy.ext.asyncio import async_sessionmaker

    test_factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    monkeypatch.setattr("takehome.db.session.async_session", test_factory)

    conv = await create_conversation(db_session)
    body = MessageCreate(content="What does section 1 say?")

    response = await send_message(conversation_id=conv.id, body=body, session=db_session)
    events = await _collect_stream(response)

    # Should have content events, a message event, and a done event
    content_events = [e for e in events if e["type"] == "content"]
    message_events = [e for e in events if e["type"] == "message"]
    done_events = [e for e in events if e["type"] == "done"]

    assert len(content_events) == 3
    assert len(message_events) == 1
    assert len(done_events) == 1
    assert done_events[0]["sources_cited"] == 0
    assert message_events[0]["message"]["sources_cited"] == 0
    assert message_events[0]["message"]["citations"] == []
    assert message_events[0]["message"]["content"] == REFUSAL_MESSAGE

    stored_messages = await list_messages(conversation_id=conv.id, session=db_session)
    assert stored_messages[-1].citations == []
    assert stored_messages[-1].content == REFUSAL_MESSAGE

    # Title should have been generated (first user message)
    mock_title.assert_called_once_with("What does section 1 say?")


@patch("takehome.web.routers.messages.generate_title", new_callable=AsyncMock)
@patch("takehome.web.routers.messages.chat_with_documents", side_effect=_fake_grounded_chat_stream)
async def test_send_message_persists_and_streams_valid_citations(
    mock_chat, mock_title, db_session, monkeypatch
):
    mock_title.return_value = "Generated Title"

    from sqlalchemy.ext.asyncio import async_sessionmaker

    test_factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    monkeypatch.setattr("takehome.db.session.async_session", test_factory)

    conv = await create_conversation(db_session)
    db_session.add(
        Document(
            conversation_id=conv.id,
            filename="lease.pdf",
            file_path="/tmp/lease.pdf",
            extracted_text="--- Page 1 ---\nLease text",
            page_count=3,
        )
    )
    await db_session.commit()

    body = MessageCreate(content="What does page 1 say?")

    response = await send_message(conversation_id=conv.id, body=body, session=db_session)
    events = await _collect_stream(response)

    message_events = [e for e in events if e["type"] == "message"]
    done_events = [e for e in events if e["type"] == "done"]
    final_message = message_events[0]["message"]

    assert done_events[0]["sources_cited"] == 1
    assert final_message["sources_cited"] == 1
    assert final_message["content"] == "Based on lease.pdf page 1, the answer is yes."
    assert final_message["citations"][0]["filename"] == "lease.pdf"
    assert final_message["citations"][0]["page"] == 1
    assert final_message["citations"][0]["label"] == "lease.pdf p.1"

    stored_messages = await list_messages(conversation_id=conv.id, session=db_session)
    assert stored_messages[-1].sources_cited == 1
    assert stored_messages[-1].citations == final_message["citations"]


@patch("takehome.web.routers.messages.generate_title", new_callable=AsyncMock)
@patch("takehome.web.routers.messages.chat_with_documents", side_effect=_fake_chat_stream)
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
@patch("takehome.web.routers.messages.chat_with_documents", side_effect=_fake_chat_stream)
async def test_send_message_with_two_documents(mock_chat, mock_title, db_session, monkeypatch):
    """When conversation has 2 documents, both are passed to chat_with_documents."""
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
    db_session.add(
        Document(
            conversation_id=conv.id,
            filename="deed.pdf",
            file_path="/tmp/deed.pdf",
            extracted_text="Deed content here.",
            page_count=2,
        )
    )
    await db_session.commit()

    body = MessageCreate(content="What is this?")
    response = await send_message(conversation_id=conv.id, body=body, session=db_session)
    await _collect_stream(response)

    # Verify chat_with_documents was called with both documents
    call_kwargs = mock_chat.call_args.kwargs
    assert len(call_kwargs["documents"]) == 2
    filenames = {d[0] for d in call_kwargs["documents"]}
    assert filenames == {"lease.pdf", "deed.pdf"}


@patch("takehome.web.routers.messages.generate_title", new_callable=AsyncMock)
@patch("takehome.web.routers.messages.chat_with_documents", side_effect=_fake_chat_stream)
async def test_send_message_with_zero_documents(mock_chat, mock_title, db_session, monkeypatch):
    """When conversation has 0 documents, empty list is passed."""
    from sqlalchemy.ext.asyncio import async_sessionmaker

    test_factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    monkeypatch.setattr("takehome.db.session.async_session", test_factory)
    mock_title.return_value = "T"

    conv = await create_conversation(db_session)
    body = MessageCreate(content="hi")
    response = await send_message(conversation_id=conv.id, body=body, session=db_session)
    await _collect_stream(response)

    call_kwargs = mock_chat.call_args.kwargs
    assert call_kwargs["documents"] == []


async def _failing_chat_stream(user_message, documents, conversation_history):
    raise RuntimeError("LLM exploded")
    yield  # unreachable, makes this an async generator


@patch("takehome.web.routers.messages.generate_title", new_callable=AsyncMock)
@patch("takehome.web.routers.messages.chat_with_documents", side_effect=_failing_chat_stream)
async def test_send_message_llm_error_handled(mock_chat, mock_title, db_session, monkeypatch):
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
@patch("takehome.web.routers.messages.chat_with_documents", side_effect=_fake_chat_stream)
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
