from __future__ import annotations

MINIMAL_PDF = (
    b"%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj "
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj "
    b"3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\n"
    b"xref\n0 4\n"
    b"0000000000 65535 f \n"
    b"0000000009 00000 n \n"
    b"0000000058 00000 n \n"
    b"0000000115 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"
)


async def test_upload_document_success(client, tmp_upload_dir):
    create_resp = await client.post("/api/conversations")
    cid = create_resp.json()["id"]

    resp = await client.post(
        f"/api/conversations/{cid}/documents",
        files={"file": ("test.pdf", MINIMAL_PDF, "application/pdf")},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["filename"] == "test.pdf"
    assert data["conversation_id"] == cid


async def test_upload_document_conversation_not_found(client, tmp_upload_dir):
    resp = await client.post(
        "/api/conversations/nonexistent12345/documents",
        files={"file": ("test.pdf", MINIMAL_PDF, "application/pdf")},
    )
    assert resp.status_code == 404


async def test_upload_document_duplicate(client, tmp_upload_dir):
    create_resp = await client.post("/api/conversations")
    cid = create_resp.json()["id"]

    await client.post(
        f"/api/conversations/{cid}/documents",
        files={"file": ("test.pdf", MINIMAL_PDF, "application/pdf")},
    )
    resp = await client.post(
        f"/api/conversations/{cid}/documents",
        files={"file": ("test2.pdf", MINIMAL_PDF, "application/pdf")},
    )
    assert resp.status_code == 409


async def test_upload_document_non_pdf(client, tmp_upload_dir):
    create_resp = await client.post("/api/conversations")
    cid = create_resp.json()["id"]

    resp = await client.post(
        f"/api/conversations/{cid}/documents",
        files={"file": ("test.txt", b"not a pdf", "text/plain")},
    )
    assert resp.status_code == 400


async def test_serve_document_not_found(client):
    resp = await client.get("/api/documents/nonexistent12345/content")
    assert resp.status_code == 404


async def test_serve_document_success(client, tmp_upload_dir):
    create_resp = await client.post("/api/conversations")
    cid = create_resp.json()["id"]

    upload_resp = await client.post(
        f"/api/conversations/{cid}/documents",
        files={"file": ("test.pdf", MINIMAL_PDF, "application/pdf")},
    )
    doc_id = upload_resp.json()["id"]

    resp = await client.get(f"/api/documents/{doc_id}/content")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
