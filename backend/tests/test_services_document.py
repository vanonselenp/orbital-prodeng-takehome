from __future__ import annotations

import io

import pytest
from fastapi import UploadFile

from takehome.db.models import Document
from takehome.services.conversation import create_conversation
from takehome.services.document import (
    get_document,
    get_document_for_conversation,
    upload_document,
)

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


async def test_get_document_not_found(db_session):
    result = await get_document(db_session, "nonexistent12345")
    assert result is None


async def test_get_document_exists(db_session):
    conv = await create_conversation(db_session)
    doc = Document(
        conversation_id=conv.id,
        filename="test.pdf",
        file_path="/tmp/test.pdf",
        page_count=1,
    )
    db_session.add(doc)
    await db_session.flush()

    fetched = await get_document(db_session, doc.id)
    assert fetched is not None
    assert fetched.filename == "test.pdf"


async def test_get_document_for_conversation_not_found(db_session):
    result = await get_document_for_conversation(db_session, "nonexistent12345")
    assert result is None


async def test_get_document_for_conversation_exists(db_session):
    conv = await create_conversation(db_session)
    doc = Document(
        conversation_id=conv.id,
        filename="test.pdf",
        file_path="/tmp/test.pdf",
        page_count=1,
    )
    db_session.add(doc)
    await db_session.flush()

    fetched = await get_document_for_conversation(db_session, conv.id)
    assert fetched is not None
    assert fetched.id == doc.id


async def test_upload_document_success(db_session, tmp_upload_dir):
    conv = await create_conversation(db_session)
    file = make_upload_file(MINIMAL_PDF)
    doc = await upload_document(db_session, conv.id, file)

    assert doc.id is not None
    assert doc.conversation_id == conv.id
    assert doc.filename == "test.pdf"
    assert doc.page_count >= 0


async def test_upload_document_duplicate_rejected(db_session, tmp_upload_dir):
    conv = await create_conversation(db_session)
    file1 = make_upload_file(MINIMAL_PDF)
    await upload_document(db_session, conv.id, file1)

    file2 = make_upload_file(MINIMAL_PDF)
    with pytest.raises(ValueError, match="already has a document"):
        await upload_document(db_session, conv.id, file2)


async def test_upload_document_non_pdf_rejected(db_session, tmp_upload_dir):
    conv = await create_conversation(db_session)
    file = make_upload_file(b"not a pdf", filename="test.txt", content_type="text/plain")
    with pytest.raises(ValueError, match="Only PDF"):
        await upload_document(db_session, conv.id, file)


async def test_upload_document_too_large(db_session, tmp_upload_dir, monkeypatch):
    from takehome.config import settings

    monkeypatch.setattr(settings, "max_upload_size", 10)
    conv = await create_conversation(db_session)
    file = make_upload_file(MINIMAL_PDF)
    with pytest.raises(ValueError, match="File too large"):
        await upload_document(db_session, conv.id, file)
