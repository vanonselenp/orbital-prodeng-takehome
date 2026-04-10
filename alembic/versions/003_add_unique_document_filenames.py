"""Enforce unique document filenames per conversation.

Revision ID: 003_unique_document_filenames
Revises: 002_add_citations_and_grounding
Create Date: 2026-04-10 23:10:00.000000
"""

from __future__ import annotations

import os
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "003_unique_document_filenames"
down_revision: str | None = "002_add_citations_and_grounding"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def make_unique_filename(filename: str, existing_filenames: set[str]) -> str:
    if filename not in existing_filenames:
        return filename

    stem, suffix = os.path.splitext(filename)
    index = 1
    while True:
        candidate = f"{stem} ({index}){suffix}"
        if candidate not in existing_filenames:
            return candidate
        index += 1


def backfill_duplicate_filenames() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT id, conversation_id, filename
            FROM documents
            ORDER BY conversation_id, uploaded_at, id
            """
        )
    ).mappings()

    filenames_by_conversation: dict[str, set[str]] = {}
    for row in rows:
        conversation_id = row["conversation_id"]
        filename = row["filename"]
        existing_filenames = filenames_by_conversation.setdefault(conversation_id, set())
        unique_filename = make_unique_filename(filename, existing_filenames)
        if unique_filename != filename:
            connection.execute(
                sa.text("UPDATE documents SET filename = :filename WHERE id = :id"),
                {"id": row["id"], "filename": unique_filename},
            )
        existing_filenames.add(unique_filename)


def upgrade() -> None:
    backfill_duplicate_filenames()
    op.create_unique_constraint(
        "uq_documents_conversation_filename",
        "documents",
        ["conversation_id", "filename"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_documents_conversation_filename", "documents", type_="unique")
