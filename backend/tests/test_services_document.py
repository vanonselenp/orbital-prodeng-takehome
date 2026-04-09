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


async def test_upload_document_pdf_extraction_failure_is_tolerated(
    db_session, tmp_upload_dir
):
    """If PDF extraction raises, we still create the record with empty text."""
    conv = await create_conversation(db_session)
    # A file with the .pdf extension but garbage contents; PyMuPDF will raise.
    file = make_upload_file(b"not really a pdf at all", filename="corrupt.pdf")
    doc = await upload_document(db_session, conv.id, file)

    assert doc.filename == "corrupt.pdf"
    assert doc.extracted_text is None
    assert doc.page_count == 0


async def test_upload_document_accepts_pdf_by_extension(db_session, tmp_upload_dir):
    """Files with .pdf extension should be accepted even with non-PDF content type."""
    conv = await create_conversation(db_session)
    file = make_upload_file(
        MINIMAL_PDF, filename="test.pdf", content_type="application/octet-stream"
    )
    doc = await upload_document(db_session, conv.id, file)
    assert doc.filename == "test.pdf"


async def test_upload_document_empty_text_page(db_session, tmp_upload_dir):
    """A PDF with pages that yield empty text exercises the strip() branch."""
    conv = await create_conversation(db_session)
    file = make_upload_file(MINIMAL_PDF)
    doc = await upload_document(db_session, conv.id, file)
    # Our minimal PDF has no text content, so extracted_text should be empty/None.
    assert doc.extracted_text is None or doc.extracted_text == ""


async def test_upload_document_with_real_pdf_text(db_session, tmp_upload_dir):
    """Upload a real PDF from sample-docs to exercise the text-extraction path."""
    import pathlib

    sample = (
        pathlib.Path(__file__).resolve().parents[2]
        / "sample-docs"
        / "title-report-lot-7.pdf"
    )
    content = sample.read_bytes()
    conv = await create_conversation(db_session)
    file = make_upload_file(content, filename="title-report-lot-7.pdf")
    doc = await upload_document(db_session, conv.id, file)

    assert doc.page_count > 0
    assert doc.extracted_text is not None
    assert len(doc.extracted_text) > 0
    assert "--- Page 1 ---" in doc.extracted_text
