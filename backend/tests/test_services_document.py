from __future__ import annotations

import io

import pytest
from fastapi import UploadFile

from takehome.db.models import Document
from takehome.services.conversation import create_conversation
from takehome.services.document import (
    MAX_DOCUMENTS_PER_CONVERSATION,
    delete_document,
    get_document,
    get_documents_for_conversation,
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


def make_upload_file(
    content: bytes, filename: str = "test.pdf", content_type: str = "application/pdf"
) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(content), filename=filename, headers={"content-type": content_type}
    )


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


async def test_upload_document_success(db_session, tmp_upload_dir):
    conv = await create_conversation(db_session)
    file = make_upload_file(MINIMAL_PDF)
    doc = await upload_document(db_session, conv.id, file)

    assert doc.id is not None
    assert doc.conversation_id == conv.id
    assert doc.filename == "test.pdf"
    assert doc.page_count >= 0


async def test_upload_multiple_documents_succeeds(db_session, tmp_upload_dir):
    """Uploading multiple documents to the same conversation should succeed."""
    conv = await create_conversation(db_session)
    file1 = make_upload_file(MINIMAL_PDF, filename="doc1.pdf")
    file2 = make_upload_file(MINIMAL_PDF, filename="doc2.pdf")
    file3 = make_upload_file(MINIMAL_PDF, filename="doc3.pdf")

    doc1 = await upload_document(db_session, conv.id, file1)
    doc2 = await upload_document(db_session, conv.id, file2)
    doc3 = await upload_document(db_session, conv.id, file3)

    assert doc1.filename == "doc1.pdf"
    assert doc2.filename == "doc2.pdf"
    assert doc3.filename == "doc3.pdf"
    assert doc1.id != doc2.id != doc3.id


async def test_upload_document_at_limit_raises(db_session, tmp_upload_dir):
    """Uploading when at the 10-document limit should raise ValueError."""
    conv = await create_conversation(db_session)
    for i in range(MAX_DOCUMENTS_PER_CONVERSATION):
        f = make_upload_file(MINIMAL_PDF, filename=f"doc{i}.pdf")
        await upload_document(db_session, conv.id, f)

    extra = make_upload_file(MINIMAL_PDF, filename="extra.pdf")
    with pytest.raises(ValueError, match="Maximum number of documents"):
        await upload_document(db_session, conv.id, extra)


async def test_get_documents_for_conversation_returns_all_ordered(db_session, tmp_upload_dir):
    """get_documents_for_conversation returns all docs ordered by uploaded_at ascending."""
    conv = await create_conversation(db_session)
    file1 = make_upload_file(MINIMAL_PDF, filename="first.pdf")
    file2 = make_upload_file(MINIMAL_PDF, filename="second.pdf")

    await upload_document(db_session, conv.id, file1)
    await upload_document(db_session, conv.id, file2)

    docs = await get_documents_for_conversation(db_session, conv.id)
    assert len(docs) == 2
    assert docs[0].filename == "first.pdf"
    assert docs[1].filename == "second.pdf"


async def test_get_documents_for_conversation_empty(db_session):
    """get_documents_for_conversation returns empty list when no docs exist."""
    conv = await create_conversation(db_session)
    docs = await get_documents_for_conversation(db_session, conv.id)
    assert docs == []


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


async def test_upload_document_pdf_extraction_failure_is_tolerated(db_session, tmp_upload_dir):
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

    sample = pathlib.Path(__file__).resolve().parents[2] / "sample-docs" / "title-report-lot-7.pdf"
    content = sample.read_bytes()
    conv = await create_conversation(db_session)
    file = make_upload_file(content, filename="title-report-lot-7.pdf")
    doc = await upload_document(db_session, conv.id, file)

    assert doc.page_count > 0
    assert doc.extracted_text is not None
    assert len(doc.extracted_text) > 0
    assert "--- Page 1 ---" in doc.extracted_text


async def test_delete_document_existing(db_session, tmp_upload_dir):
    """Deleting an existing document returns True, removes DB record and file from disk."""
    import os

    conv = await create_conversation(db_session)
    file = make_upload_file(MINIMAL_PDF, filename="todelete.pdf")
    doc = await upload_document(db_session, conv.id, file)

    file_path = doc.file_path
    assert os.path.exists(file_path)

    result = await delete_document(db_session, doc.id)
    assert result is True

    # DB record should be gone
    fetched = await get_document(db_session, doc.id)
    assert fetched is None

    # File should be removed from disk
    assert not os.path.exists(file_path)


async def test_delete_document_not_found(db_session):
    """Deleting a non-existent document returns False."""
    result = await delete_document(db_session, "nonexistent12345")
    assert result is False


async def test_delete_document_file_already_missing(db_session):
    """Deleting a document where file is already missing on disk still succeeds."""
    conv = await create_conversation(db_session)
    doc = Document(
        conversation_id=conv.id,
        filename="ghost.pdf",
        file_path="/nonexistent/path/ghost.pdf",
        page_count=1,
    )
    db_session.add(doc)
    await db_session.flush()

    result = await delete_document(db_session, doc.id)
    assert result is True

    # DB record should be gone
    fetched = await get_document(db_session, doc.id)
    assert fetched is None


async def test_delete_document_wrong_conversation_returns_false(db_session):
    """delete_document scoped by conversation_id returns False for mismatched conversation."""
    conv_a = await create_conversation(db_session)
    conv_b = await create_conversation(db_session)
    doc = Document(
        conversation_id=conv_a.id,
        filename="scoped.pdf",
        file_path="/nonexistent/scoped.pdf",
        page_count=1,
    )
    db_session.add(doc)
    await db_session.flush()

    result = await delete_document(db_session, doc.id, conv_b.id)
    assert result is False

    # Document should still exist
    fetched = await get_document(db_session, doc.id)
    assert fetched is not None
