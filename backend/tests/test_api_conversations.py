from __future__ import annotations


async def test_create_conversation(client):
    resp = await client.post("/api/conversations")
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["title"] == "New Conversation"
    assert data["has_document"] is False


async def test_list_conversations_empty(client):
    resp = await client.get("/api/conversations")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_conversations_with_data(client):
    await client.post("/api/conversations")
    await client.post("/api/conversations")
    resp = await client.get("/api/conversations")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_get_conversation(client):
    create_resp = await client.post("/api/conversations")
    cid = create_resp.json()["id"]

    resp = await client.get(f"/api/conversations/{cid}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == cid
    assert data["has_document"] is False
    assert data["document"] is None


async def test_get_conversation_not_found(client):
    resp = await client.get("/api/conversations/nonexistent12345")
    assert resp.status_code == 404


async def test_update_conversation(client):
    create_resp = await client.post("/api/conversations")
    cid = create_resp.json()["id"]

    resp = await client.patch(f"/api/conversations/{cid}", json={"title": "Updated"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated"


async def test_update_conversation_not_found(client):
    resp = await client.patch("/api/conversations/nonexistent12345", json={"title": "X"})
    assert resp.status_code == 404


async def test_delete_conversation(client):
    create_resp = await client.post("/api/conversations")
    cid = create_resp.json()["id"]

    resp = await client.delete(f"/api/conversations/{cid}")
    assert resp.status_code == 204

    get_resp = await client.get(f"/api/conversations/{cid}")
    assert get_resp.status_code == 404


async def test_delete_conversation_not_found(client):
    resp = await client.delete("/api/conversations/nonexistent12345")
    assert resp.status_code == 404
