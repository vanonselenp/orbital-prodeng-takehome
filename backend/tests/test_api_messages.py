from __future__ import annotations

from takehome.db.models import Message


async def test_list_messages_empty(client):
    create_resp = await client.post("/api/conversations")
    cid = create_resp.json()["id"]

    resp = await client.get(f"/api/conversations/{cid}/messages")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_messages_with_data(client, db_session):
    create_resp = await client.post("/api/conversations")
    cid = create_resp.json()["id"]

    msg1 = Message(conversation_id=cid, role="user", content="Hello")
    msg2 = Message(conversation_id=cid, role="assistant", content="Hi there")
    db_session.add(msg1)
    db_session.add(msg2)
    await db_session.flush()

    resp = await client.get(f"/api/conversations/{cid}/messages")
    assert resp.status_code == 200
    messages = resp.json()
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"


async def test_list_messages_conversation_not_found(client):
    resp = await client.get("/api/conversations/nonexistent12345/messages")
    assert resp.status_code == 404
