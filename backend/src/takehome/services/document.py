from __future__ import annotations

import os
import uuid
from typing import cast

import fitz  # type: ignore[reportMissingTypeStubs] # PyMuPDF
import structlog
from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from takehome.config import settings
from takehome.db.models import Document

logger = structlog.get_logger()

MAX_DOCUMENTS_PER_CONVERSATION = 10


async def upload_document(
    session: AsyncSession, conversation_id: str, file: UploadFile
) -> Document:
    """Upload and process a PDF document for a conversation.

    Validates the file is a PDF, saves it to disk, extracts text using PyMuPDF,
    and stores metadata in the database.

    Raises ValueError if the conversation has reached the document limit or the file is not a PDF.
    """
    # Check if conversation has reached the document limit
    stmt = (
        select(func.count())
        .select_from(Document)
        .where(Document.conversation_id == conversation_id)
    )
    result = await session.execute(stmt)
    count = result.scalar_one()
    if count >= MAX_DOCUMENTS_PER_CONVERSATION:
        raise ValueError("Maximum number of documents (10) reached")

    original_filename = file.filename or "document.pdf"

    duplicate_stmt = select(Document).where(
        Document.conversation_id == conversation_id,
        Document.filename == original_filename,
    )
    duplicate_result = await session.execute(duplicate_stmt)
    if duplicate_result.scalar_one_or_none() is not None:
        raise ValueError(
            f"A document named '{original_filename}' already exists in this conversation."
        )

    # Validate file type
    if file.content_type not in ("application/pdf", "application/x-pdf"):
        if not original_filename.lower().endswith(".pdf"):
            raise ValueError("Only PDF files are supported.")

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > settings.max_upload_size:
        raise ValueError(
            f"File too large. Maximum size is {settings.max_upload_size // (1024 * 1024)}MB."
        )

    # Generate a unique filename to avoid collisions
    unique_name = f"{uuid.uuid4().hex}_{original_filename}"
    file_path = os.path.join(settings.upload_dir, unique_name)

    # Ensure upload directory exists
    os.makedirs(settings.upload_dir, exist_ok=True)

    # Save the file to disk
    with open(file_path, "wb") as f:
        f.write(content)

    logger.info("Saved uploaded PDF", filename=original_filename, path=file_path, size=len(content))

    # Extract text using PyMuPDF
    extracted_text = ""
    page_count = 0
    try:
        doc = fitz.open(file_path)
        page_count = len(doc)
        pages: list[str] = []
        for page_num in range(page_count):
            page = doc[page_num]
            text = cast(str, page.get_text())  # type: ignore[union-attr]
            if text.strip():
                pages.append(f"--- Page {page_num + 1} ---\n{text}")
        extracted_text = "\n\n".join(pages)
        doc.close()
    except Exception:
        logger.exception("Failed to extract text from PDF", filename=original_filename)
        extracted_text = ""

    logger.info(
        "Extracted text from PDF",
        filename=original_filename,
        page_count=page_count,
        text_length=len(extracted_text),
    )

    # Create the document record
    document = Document(
        conversation_id=conversation_id,
        filename=original_filename,
        file_path=file_path,
        extracted_text=extracted_text if extracted_text else None,
        page_count=page_count,
    )
    session.add(document)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        try:
            os.remove(file_path)
        except FileNotFoundError:
            pass
        raise ValueError(
            f"A document named '{original_filename}' already exists in this conversation."
        ) from exc
    await session.refresh(document)
    return document


async def get_document(session: AsyncSession, document_id: str) -> Document | None:
    """Get a document by its ID."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_documents_for_conversation(
    session: AsyncSession, conversation_id: str
) -> list[Document]:
    """Get all documents for a conversation, ordered by uploaded_at ascending."""
    stmt = (
        select(Document)
        .where(Document.conversation_id == conversation_id)
        .order_by(Document.uploaded_at.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def delete_document(
    session: AsyncSession, document_id: str, conversation_id: str | None = None
) -> bool:
    """Delete a document record and its file from disk.

    Returns True if the document existed and was deleted, False if not found.
    When conversation_id is provided, the document must belong to that conversation.
    Handles missing files on disk gracefully.
    """
    stmt = select(Document).where(Document.id == document_id)
    if conversation_id is not None:
        stmt = stmt.where(Document.conversation_id == conversation_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()

    if document is None:
        return False

    # Remove the file from disk, tolerating missing files
    try:
        os.remove(document.file_path)
    except FileNotFoundError:
        logger.warning("File already missing on disk", file_path=document.file_path)

    await session.delete(document)
    await session.commit()
    return True
