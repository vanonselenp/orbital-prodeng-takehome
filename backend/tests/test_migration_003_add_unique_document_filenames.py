from __future__ import annotations

import importlib.util
from pathlib import Path


def load_migration_module():
    module_path = (
        Path(__file__).resolve().parents[2]
        / "alembic"
        / "versions"
        / "003_add_unique_document_filenames.py"
    )
    spec = importlib.util.spec_from_file_location("migration_003", module_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Failed to load migration module")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_make_unique_filename_preserves_original_when_unused():
    migration = load_migration_module()

    result = migration.make_unique_filename("lease.pdf", set())

    assert result == "lease.pdf"


def test_make_unique_filename_appends_numeric_suffix_before_extension():
    migration = load_migration_module()

    result = migration.make_unique_filename(
        "lease.pdf",
        {"lease.pdf", "lease (1).pdf"},
    )

    assert result == "lease (2).pdf"


def test_make_unique_filename_handles_files_without_extension():
    migration = load_migration_module()

    result = migration.make_unique_filename("lease", {"lease"})

    assert result == "lease (1)"
