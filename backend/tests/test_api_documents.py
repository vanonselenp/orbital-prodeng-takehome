"""Unit tests for document router endpoints (direct-call, see conversations test note)."""

from __future__ import annotations

import io

import pytest
from fastapi import HTTPException, UploadFile

from takehome.db.models import Document
from takehome.services.conversation import create_conversation
from takehome.services.document import MAX_DOCUMENTS_PER_CONVERSATION
from takehome.web.routers.documents import (
    delete_document_endpoint,
    list_documents_endpoint,
    serve_document_file,
    upload_document_endpoint,
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


async def test_upload_document_success(db_session, tmp_upload_dir):
    conv = await create_conversation(db_session)
    file = make_upload_file(MINIMAL_PDF)

    result = await upload_document_endpoint(conversation_id=conv.id, file=file, session=db_session)
    assert result.conversation_id == conv.id
    assert result.filename == "test.pdf"


async def test_upload_document_conversation_not_found(db_session, tmp_upload_dir):
    file = make_upload_file(MINIMAL_PDF)
    with pytest.raises(HTTPException) as exc:
        await upload_document_endpoint(conversation_id="nonexistent", file=file, session=db_session)
    assert exc.value.status_code == 404


async def test_upload_second_document_returns_201(db_session, tmp_upload_dir):
    """Uploading a second document to the same conversation succeeds (no longer 409)."""
    conv = await create_conversation(db_session)
    file1 = make_upload_file(MINIMAL_PDF, filename="first.pdf")
    await upload_document_endpoint(conversation_id=conv.id, file=file1, session=db_session)

    file2 = make_upload_file(MINIMAL_PDF, filename="second.pdf")
    result = await upload_document_endpoint(conversation_id=conv.id, file=file2, session=db_session)
    assert result.filename == "second.pdf"


async def test_upload_at_limit_returns_409(db_session, tmp_upload_dir):
    """Uploading when at the 10-document limit returns 409."""
    conv = await create_conversation(db_session)
    for i in range(MAX_DOCUMENTS_PER_CONVERSATION):
        f = make_upload_file(MINIMAL_PDF, filename=f"doc{i}.pdf")
        await upload_document_endpoint(conversation_id=conv.id, file=f, session=db_session)

    extra = make_upload_file(MINIMAL_PDF, filename="extra.pdf")
    with pytest.raises(HTTPException) as exc:
        await upload_document_endpoint(conversation_id=conv.id, file=extra, session=db_session)
    assert exc.value.status_code == 409


async def test_upload_document_non_pdf(db_session, tmp_upload_dir):
    conv = await create_conversation(db_session)
    file = make_upload_file(b"not a pdf", filename="test.txt", content_type="text/plain")
    with pytest.raises(HTTPException) as exc:
        await upload_document_endpoint(conversation_id=conv.id, file=file, session=db_session)
    assert exc.value.status_code == 400


async def test_list_documents_returns_all(db_session):
    """GET list returns all documents for a conversation."""
    conv = await create_conversation(db_session)
    doc1 = Document(conversation_id=conv.id, filename="a.pdf", file_path="/tmp/a.pdf", page_count=1)
    doc2 = Document(conversation_id=conv.id, filename="b.pdf", file_path="/tmp/b.pdf", page_count=2)
    db_session.add(doc1)
    db_session.add(doc2)
    await db_session.commit()

    result = await list_documents_endpoint(conversation_id=conv.id, session=db_session)
    assert len(result) == 2
    filenames = {d.filename for d in result}
    assert filenames == {"a.pdf", "b.pdf"}


async def test_list_documents_conversation_not_found(db_session):
    """GET list returns 404 if conversation does not exist."""
    with pytest.raises(HTTPException) as exc:
        await list_documents_endpoint(conversation_id="nonexistent", session=db_session)
    assert exc.value.status_code == 404


async def test_delete_document_returns_204(db_session):
    """DELETE returns 204 and document is gone."""
    conv = await create_conversation(db_session)
    doc = Document(
        conversation_id=conv.id,
        filename="del.pdf",
        file_path="/nonexistent/del.pdf",
        page_count=1,
    )
    db_session.add(doc)
    await db_session.commit()

    # Should not raise (204 response)
    await delete_document_endpoint(conversation_id=conv.id, document_id=doc.id, session=db_session)

    # Document should be gone
    result = await list_documents_endpoint(conversation_id=conv.id, session=db_session)
    assert len(result) == 0


async def test_delete_document_wrong_conversation_returns_404(db_session):
    """DELETE rejects a document that belongs to a different conversation."""
    conv_a = await create_conversation(db_session)
    conv_b = await create_conversation(db_session)
    doc = Document(
        conversation_id=conv_a.id,
        filename="owned.pdf",
        file_path="/nonexistent/owned.pdf",
        page_count=1,
    )
    db_session.add(doc)
    await db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await delete_document_endpoint(
            conversation_id=conv_b.id, document_id=doc.id, session=db_session
        )
    assert exc.value.status_code == 404

    # Document should still exist in conv_a
    result = await list_documents_endpoint(conversation_id=conv_a.id, session=db_session)
    assert len(result) == 1


async def test_delete_document_not_found_returns_404(db_session):
    """DELETE non-existent document returns 404."""
    conv = await create_conversation(db_session)
    with pytest.raises(HTTPException) as exc:
        await delete_document_endpoint(
            conversation_id=conv.id, document_id="nonexistent", session=db_session
        )
    assert exc.value.status_code == 404


async def test_serve_document_not_found(db_session):
    with pytest.raises(HTTPException) as exc:
        await serve_document_file(document_id="nonexistent", session=db_session)
    assert exc.value.status_code == 404


async def test_serve_document_file_missing_on_disk(db_session):
    conv = await create_conversation(db_session)

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
    doc = await upload_document_endpoint(conversation_id=conv.id, file=file, session=db_session)

    result = await serve_document_file(document_id=doc.id, session=db_session)
    assert result.media_type == "application/pdf"
