"""Smoke test for app.py — ensures the FastAPI app wires up correctly.

The lifespan itself is marked pragma: no cover because it runs real Alembic
migrations against PostgreSQL. This test covers everything else in the module:
imports, CORS middleware setup, and router registration.
"""

from __future__ import annotations


def test_app_imports_and_registers_routers():
    from takehome.web.app import app

    assert app.title == "Orbital Document Q&A"

    # Verify all expected routes are registered
    paths = {route.path for route in app.routes if hasattr(route, "path")}
    assert "/api/conversations" in paths
    assert "/api/conversations/{conversation_id}" in paths
    assert "/api/conversations/{conversation_id}/messages" in paths
    assert "/api/conversations/{conversation_id}/documents" in paths
    assert "/api/conversations/{conversation_id}/documents/{document_id}" in paths
    assert "/api/documents/{document_id}/content" in paths


def test_app_has_cors_middleware():
    from takehome.web.app import app

    middleware_classes = [m.cls.__name__ for m in app.user_middleware]
    assert "CORSMiddleware" in middleware_classes
