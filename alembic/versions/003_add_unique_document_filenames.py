"""Enforce unique document filenames per conversation.

Revision ID: 003_add_unique_document_filenames
Revises: 002_add_citations_and_grounding
Create Date: 2026-04-10 23:10:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "003_add_unique_document_filenames"
down_revision: str | None = "002_add_citations_and_grounding"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_documents_conversation_filename",
        "documents",
        ["conversation_id", "filename"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_documents_conversation_filename", "documents", type_="unique")
