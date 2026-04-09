from __future__ import annotations

from takehome.db.models import Message
from takehome.services.conversation import (
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    update_conversation,
)


async def test_create_conversation(db_session):
    conv = await create_conversation(db_session)
    assert conv.id is not None
    assert len(conv.id) == 16
    assert conv.title == "New Conversation"
    assert conv.created_at is not None


async def test_create_conversation_unique_ids(db_session):
    c1 = await create_conversation(db_session)
    c2 = await create_conversation(db_session)
    assert c1.id != c2.id


async def test_list_conversations_empty(db_session):
    result = await list_conversations(db_session)
    assert result == []


async def test_list_conversations_returns_created(db_session):
    await create_conversation(db_session)
    await create_conversation(db_session)
    result = await list_conversations(db_session)
    assert len(result) == 2


async def test_get_conversation_exists(db_session):
    conv = await create_conversation(db_session)
    fetched = await get_conversation(db_session, conv.id)
    assert fetched is not None
    assert fetched.id == conv.id
    assert fetched.title == conv.title


async def test_get_conversation_not_found(db_session):
    result = await get_conversation(db_session, "nonexistent12345")
    assert result is None


async def test_update_conversation(db_session):
    conv = await create_conversation(db_session)
    updated = await update_conversation(db_session, conv.id, "New Title")
    assert updated is not None
    assert updated.title == "New Title"


async def test_update_conversation_not_found(db_session):
    result = await update_conversation(db_session, "nonexistent12345", "Title")
    assert result is None


async def test_delete_conversation(db_session):
    conv = await create_conversation(db_session)
    deleted = await delete_conversation(db_session, conv.id)
    assert deleted is True
    fetched = await get_conversation(db_session, conv.id)
    assert fetched is None


async def test_delete_conversation_not_found(db_session):
    result = await delete_conversation(db_session, "nonexistent12345")
    assert result is False


async def test_delete_conversation_cascades_messages(db_session):
    conv = await create_conversation(db_session)
    msg = Message(conversation_id=conv.id, role="user", content="hello")
    db_session.add(msg)
    await db_session.flush()

    deleted = await delete_conversation(db_session, conv.id)
    assert deleted is True
