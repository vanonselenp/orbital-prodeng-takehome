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
    assert result.document_count == 0
    assert result.documents == []


async def test_list_conversations_empty(db_session):
    result = await list_conversations_endpoint(session=db_session)
    assert result == []


async def test_list_conversations_with_data(db_session):
    await create_conversation(db_session)
    await create_conversation(db_session)
    result = await list_conversations_endpoint(session=db_session)
    assert len(result) == 2
    assert all(item.document_count == 0 for item in result)


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
    assert result[0].document_count == 1


async def test_get_conversation_endpoint(db_session):
    conv = await create_conversation(db_session)
    result = await get_conversation_endpoint(conversation_id=conv.id, session=db_session)
    assert result.id == conv.id
    assert result.document_count == 0
    assert result.documents == []


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
    assert result.document_count == 1
    assert len(result.documents) == 1
    assert result.documents[0].filename == "test.pdf"
    assert result.documents[0].page_count == 5


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
    assert result.document_count == 0


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
    assert result.document_count == 1
    assert len(result.documents) == 1
    assert result.documents[0].filename == "test.pdf"


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


async def test_conversation_with_zero_documents(db_session):
    """Conversation with 0 documents returns document_count=0 and documents=[]."""
    conv = await create_conversation(db_session)
    result = await get_conversation_endpoint(conversation_id=conv.id, session=db_session)
    assert result.document_count == 0
    assert result.documents == []


async def test_conversation_with_multiple_documents(db_session):
    """Conversation with 2+ documents returns correct document_count and all documents."""
    conv = await create_conversation(db_session)
    doc1 = Document(
        conversation_id=conv.id,
        filename="first.pdf",
        file_path="/tmp/first.pdf",
        page_count=2,
    )
    doc2 = Document(
        conversation_id=conv.id,
        filename="second.pdf",
        file_path="/tmp/second.pdf",
        page_count=5,
    )
    db_session.add(doc1)
    db_session.add(doc2)
    await db_session.commit()

    result = await get_conversation_endpoint(conversation_id=conv.id, session=db_session)
    assert result.document_count == 2
    assert len(result.documents) == 2
    filenames = {d.filename for d in result.documents}
    assert filenames == {"first.pdf", "second.pdf"}
