from __future__ import annotations

from takehome.config import Settings


def test_settings_defaults():
    s = Settings(database_url="sqlite://", anthropic_api_key="", _env_file=None)
    assert s.max_upload_size == 25 * 1024 * 1024
    assert s.upload_dir == "uploads"


def test_settings_custom_values():
    s = Settings(
        database_url="postgresql+asyncpg://user:pass@host/db",
        anthropic_api_key="sk-test-123",
        upload_dir="/custom/uploads",
        max_upload_size=1024,
        _env_file=None,
    )
    assert s.database_url == "postgresql+asyncpg://user:pass@host/db"
    assert s.anthropic_api_key == "sk-test-123"
    assert s.upload_dir == "/custom/uploads"
    assert s.max_upload_size == 1024
