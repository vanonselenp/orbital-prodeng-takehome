# AGENTS.md

## Key requirements

- **Red-green-refactor TDD**: All new code must be developed using the red-green-refactor cycle. Write a failing test first, make it pass with minimal code, then refactor. Do not write production code without a failing test driving it.
- **100% code coverage**: Both backend and frontend must report 100% coverage. Not every line needs a test — use `/* v8 ignore start */` / `/* v8 ignore stop */` (frontend) or `# pragma: no cover` (backend) to skip lines, but only when the skipped code is not business logic and the effort to test it outweighs the value (e.g., unreachable ref null guards, dead defensive cleanup, catch fallbacks that require corrupted runtime objects to trigger). Every ignore must include an inline justification explaining why.

## Architecture

Two-component app (FastAPI backend + React/TypeScript frontend) with PostgreSQL, all Dockerized. Not a monorepo — no workspace linking between backend and frontend.

- **Backend**: Python 3.12, FastAPI, async SQLAlchemy + asyncpg, Alembic migrations. Source in `backend/src/takehome/`. Package name is `takehome`.
- **Frontend**: React 18, Vite 6, TypeScript. Source in `frontend/src/`. Radix/shadcn UI components in `components/ui/` (excluded from test coverage).
- **Database**: PostgreSQL 16. Migrations auto-run on backend startup. Models in `backend/src/takehome/db/models.py`.
- **LLM**: `pydantic-ai` with Claude haiku. Streaming responses via SSE.

## Commands

Everything is orchestrated via `just` (justfile). Key distinction: **tests run locally**, **lint/fmt run inside containers** (requires `just dev` running).

```sh
just dev                    # Start full stack (Postgres, backend, frontend)
just test                   # Run all tests (backend + frontend, local)
just test-backend           # uv run pytest backend/tests -v
just test-frontend          # cd frontend && npx vitest run
just coverage               # Both coverage reports
just coverage-backend       # pytest --cov with term-missing + HTML
just coverage-frontend      # vitest --coverage (v8 provider)
just check                  # Lint + typecheck both (needs running containers)
just fmt                    # Format both (needs running containers)
just db-migrate "message"   # Create Alembic migration (needs running containers)
```

Single-test commands:
```sh
uv run pytest backend/tests/test_api_conversations.py -v -k "test_name"
cd frontend && npx vitest run src/components/ChatInput.test.tsx
```

## Package managers

- **Backend**: `uv` (lockfile: `uv.lock`). Dev deps in `[dependency-groups] dev` in `pyproject.toml`.
- **Frontend**: `npm` (lockfile: `package-lock.json`).

## Testing

### Backend (pytest)
- `asyncio_mode = "auto"` — all async tests run automatically, no `@pytest.mark.asyncio` needed.
- Tests use **SQLite + aiosqlite in-memory**, not PostgreSQL. Fixtures in `backend/tests/conftest.py` override the DB session.
- Coverage source: `backend/src/takehome`. Uses `pytest-cov`.

### Frontend (Vitest + jsdom)
- Coverage provider is **v8**, not istanbul. Use `/* v8 ignore start */` / `/* v8 ignore stop */` for exclusions. Istanbul-style comments (`istanbul ignore`) are silently ignored.
- `ResizeObserver` polyfill is in `src/test/setup.ts` (required by Radix ScrollArea).
- `framer-motion` and `streamdown` must be mocked — they rely on browser APIs unavailable in jsdom.
- `react-pdf` must be mocked — store `onLoadSuccess`/`onLoadError` callbacks and invoke them inside `act()`.
- Coverage excludes: `main.tsx`, `types.ts`, `components/ui/**`, test files.

## Code style

### Python
- Ruff: line length 100, Python 3.12 target. Rules: E, W, F, I, B, C4, UP.
- Pyright: **strict mode**.
- First-party import: `takehome`.

### Frontend
- Biome: **tabs** for indentation, **double quotes**, recommended rules, organize imports.
- TypeScript: strict, `noUncheckedIndexedAccess` enabled.
- Path alias: `@/*` maps to `./src/*`.

## Gotchas

- `just check` and `just fmt` require running containers (`just dev` or `just dev-detach` first). Tests do not.
- The Vite dev server proxies `/api` to `http://backend:8000` — this only works inside Docker networking. Local frontend dev outside Docker won't reach the backend.
- One document per conversation (enforced in service layer, not DB constraint).
- `ANTHROPIC_API_KEY` env var is required for LLM features. Never commit `.env`.
