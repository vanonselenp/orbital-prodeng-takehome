"""Unit tests for document router endpoints (direct-call, see conversations test note)."""
from __future__ import annotations

import io

import pytest
from fastapi import HTTPException, UploadFile

from takehome.services.conversation import create_conversation
from takehome.web.routers.documents import serve_document_file, upload_document_endpoint

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


def make_upload_file(content: bytes, filename: str = "test.pdf", content_type: str = "application/pdf") -> UploadFile:
    return UploadFile(file=io.BytesIO(content), filename=filename, headers={"content-type": content_type})


async def test_upload_document_success(db_session, tmp_upload_dir):
    conv = await create_conversation(db_session)
    file = make_upload_file(MINIMAL_PDF)

    result = await upload_document_endpoint(
        conversation_id=conv.id, file=file, session=db_session
    )
    assert result.conversation_id == conv.id
    assert result.filename == "test.pdf"


async def test_upload_document_conversation_not_found(db_session, tmp_upload_dir):
    file = make_upload_file(MINIMAL_PDF)
    with pytest.raises(HTTPException) as exc:
        await upload_document_endpoint(
            conversation_id="nonexistent", file=file, session=db_session
        )
    assert exc.value.status_code == 404


async def test_upload_document_duplicate(db_session, tmp_upload_dir):
    conv = await create_conversation(db_session)
    file1 = make_upload_file(MINIMAL_PDF)
    await upload_document_endpoint(conversation_id=conv.id, file=file1, session=db_session)

    file2 = make_upload_file(MINIMAL_PDF)
    with pytest.raises(HTTPException) as exc:
        await upload_document_endpoint(
            conversation_id=conv.id, file=file2, session=db_session
        )
    assert exc.value.status_code == 409


async def test_upload_document_non_pdf(db_session, tmp_upload_dir):
    conv = await create_conversation(db_session)
    file = make_upload_file(b"not a pdf", filename="test.txt", content_type="text/plain")
    with pytest.raises(HTTPException) as exc:
        await upload_document_endpoint(
            conversation_id=conv.id, file=file, session=db_session
        )
    assert exc.value.status_code == 400


async def test_serve_document_not_found(db_session):
    with pytest.raises(HTTPException) as exc:
        await serve_document_file(document_id="nonexistent", session=db_session)
    assert exc.value.status_code == 404


async def test_serve_document_file_missing_on_disk(db_session):
    conv = await create_conversation(db_session)
    from takehome.db.models import Document

    doc = Document(
        conversation_id=conv.id,
        filename="ghost.pdf",
        file_path="/nonexistent/path/ghost.pdf",
        page_count=1,
    )
    db_session.add(doc)
    await db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await serve_document_file(document_id=doc.id, session=db_session)
    assert exc.value.status_code == 404


async def test_serve_document_success(db_session, tmp_upload_dir):
    conv = await create_conversation(db_session)
    file = make_upload_file(MINIMAL_PDF)
    doc = await upload_document_endpoint(
        conversation_id=conv.id, file=file, session=db_session
    )

    result = await serve_document_file(document_id=doc.id, session=db_session)
    assert result.media_type == "application/pdf"
