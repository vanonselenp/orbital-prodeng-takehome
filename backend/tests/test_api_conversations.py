"""Unit tests for conversation router endpoints.

These tests call router functions directly rather than going through the
HTTP layer. This is intentional: FastAPI's HTTP dispatch triggers a
coverage-tracing bug that leaves endpoint bodies marked uncovered even
though they execute. Direct calls test the actual business logic (response
shaping, 404 handling, document-info construction) and trace properly.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from takehome.db.models import Document
from takehome.services.conversation import create_conversation
from takehome.web.routers.conversations import (
    ConversationUpdate,
    create_conversation_endpoint,
    delete_conversation_endpoint,
    get_conversation_endpoint,
    list_conversations_endpoint,
    update_conversation_endpoint,
)


async def test_create_conversation_endpoint(db_session):
    result = await create_conversation_endpoint(session=db_session)
    assert result.id is not None
    assert result.title == "New Conversation"
    assert result.has_document is False
    assert result.document is None


async def test_list_conversations_empty(db_session):
    result = await list_conversations_endpoint(session=db_session)
    assert result == []


async def test_list_conversations_with_data(db_session):
    await create_conversation(db_session)
    await create_conversation(db_session)
    result = await list_conversations_endpoint(session=db_session)
    assert len(result) == 2
    assert all(item.has_document is False for item in result)


async def test_list_conversations_with_document(db_session):
    conv = await create_conversation(db_session)
    doc = Document(
        conversation_id=conv.id,
        filename="x.pdf",
        file_path="/tmp/x.pdf",
        page_count=1,
    )
    db_session.add(doc)
    await db_session.commit()

    result = await list_conversations_endpoint(session=db_session)
    assert len(result) == 1
    assert result[0].has_document is True


async def test_get_conversation_endpoint(db_session):
    conv = await create_conversation(db_session)
    result = await get_conversation_endpoint(conversation_id=conv.id, session=db_session)
    assert result.id == conv.id
    assert result.has_document is False
    assert result.document is None


async def test_get_conversation_with_document(db_session):
    conv = await create_conversation(db_session)
    doc = Document(
        conversation_id=conv.id,
        filename="test.pdf",
        file_path="/tmp/test.pdf",
        page_count=5,
    )
    db_session.add(doc)
    await db_session.commit()

    result = await get_conversation_endpoint(conversation_id=conv.id, session=db_session)
    assert result.has_document is True
    assert result.document is not None
    assert result.document.filename == "test.pdf"
    assert result.document.page_count == 5


async def test_get_conversation_not_found(db_session):
    with pytest.raises(HTTPException) as exc:
        await get_conversation_endpoint(conversation_id="nonexistent", session=db_session)
    assert exc.value.status_code == 404


async def test_update_conversation_endpoint(db_session):
    conv = await create_conversation(db_session)
    body = ConversationUpdate(title="Updated Title")
    result = await update_conversation_endpoint(
        conversation_id=conv.id, body=body, session=db_session
    )
    assert result.title == "Updated Title"
    assert result.has_document is False


async def test_update_conversation_with_document(db_session):
    conv = await create_conversation(db_session)
    doc = Document(
        conversation_id=conv.id,
        filename="test.pdf",
        file_path="/tmp/test.pdf",
        page_count=3,
    )
    db_session.add(doc)
    await db_session.commit()

    body = ConversationUpdate(title="New")
    result = await update_conversation_endpoint(
        conversation_id=conv.id, body=body, session=db_session
    )
    assert result.title == "New"
    assert result.has_document is True
    assert result.document is not None
    assert result.document.filename == "test.pdf"


async def test_update_conversation_not_found(db_session):
    body = ConversationUpdate(title="X")
    with pytest.raises(HTTPException) as exc:
        await update_conversation_endpoint(
            conversation_id="nonexistent", body=body, session=db_session
        )
    assert exc.value.status_code == 404


async def test_delete_conversation_endpoint(db_session):
    conv = await create_conversation(db_session)
    await delete_conversation_endpoint(conversation_id=conv.id, session=db_session)

    with pytest.raises(HTTPException):
        await get_conversation_endpoint(conversation_id=conv.id, session=db_session)


async def test_delete_conversation_not_found(db_session):
    with pytest.raises(HTTPException) as exc:
        await delete_conversation_endpoint(conversation_id="nonexistent", session=db_session)
    assert exc.value.status_code == 404
