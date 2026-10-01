# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` first. It holds the business requirements, technical decisions, color scheme and coding standards (keep it simple, no over-engineering, no emojis, prove root cause before fixing). `docs/PLAN.md` is the phased project plan; `docs/review.md` is a code review with known defects.

## Commands

Full app (Docker, serves frontend + API on http://localhost:8000):

```bash
scripts/start.sh          # docker compose up -d   (start.bat on Windows)
scripts/stop.sh
docker compose up --build # rebuild after code changes
```

Backend (run from `backend/`):

```bash
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt
uvicorn app.main:app --reload                 # API on :8000
pytest tests/ -q                              # all tests
pytest tests/test_api.py::test_card_crud -q   # single test
```

Frontend (run from `frontend/`):

```bash
npm install
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run dev   # Next on :3000 against local backend
npm run lint
npm run test:unit                        # vitest
npx vitest run src/lib/kanban.test.ts    # single unit test file
npm run test:e2e                         # playwright; starts Next dev on :3000
npm run build                            # static export to frontend/out
```

## Architecture

- Single deployable: the Dockerfile builds the Next.js app as a static export (`output: "export"` -> `frontend/out`) and the FastAPI app serves it. `backend/app/main.py` mounts `/_next` and has a catch-all route that returns files from the export or falls back to `index.html`. The static dir is resolved from `FRONTEND_DIR`, `/app/frontend/out`, or `../frontend/out` relative to the backend, so running uvicorn locally after `npm run build` also serves the UI.
- Frontend is a client-only SPA: `app/page.tsx` renders `KanbanBoard`, which owns auth state (`apiMe` on load, shows `LoginForm` on failure), board state, and dnd-kit drag-and-drop. All HTTP goes through `src/lib/api.ts` (cookies via `credentials: "include"`; base URL from `NEXT_PUBLIC_API_URL`, empty = same origin). Move/rename/delete are optimistic and call `refresh()` (refetch the whole board) on error. `AiChat` calls `onBoardChanged` (= `refresh`) after each AI reply.
- Board shape (`BoardData` in `src/lib/kanban.ts`, mirrored by `schemas.py`): `{ columns: [{id, title, cardIds}], cards: {id: {id, title, details}} }`. Ordering is stored as integer `position` on `Column`/`Card` rows and rebuilt into `cardIds` by `board_to_dict` in `routers/board.py`.
- Auth: login against the `users` table sets an HMAC-signed `session` cookie (`username:signature`, key from `SECRET_KEY`). Every route calls `get_current_user(request)` itself; there is no auth dependency.
- Data: SQLAlchemy + SQLite at `DB_PATH` (default `backend/data/kanban.db`, `/app/data/kanban.db` in Docker on the `kanban-data` volume). Tables are created and the default user/board/columns/seed cards inserted in `init_db()` on app startup. Column and card ids are global text primary keys; the first board uses `col-backlog` etc., later boards get a `b{board_id}-` prefix.
- Ownership: card/column access must be scoped to the user's board. Use `get_user_board` and `get_owned_card` from `routers/board.py`; `reorder_column` renormalizes positions after moves/deletes.
- AI: `app/ai.py` calls OpenRouter (`openai/gpt-oss-120b`, `response_format: json_object`) with a system prompt, chat history, and the current board JSON. The reply is validated as `AIResponse` (`message` + `operations`), and `apply_operations` in `routers/ai.py` applies `create_card` / `update_card` / `move_card` / `delete_card` / `rename_column` to the DB before returning. Requires `OPENROUTER_API_KEY` in the root `.env`.
- Backend tests use FastAPI `TestClient` with `get_db` overridden to a temp SQLite DB per test (see the `client` fixture in `backend/tests/test_api.py`).
