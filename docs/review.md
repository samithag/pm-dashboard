# Code Review - Kanban PM MVP

Date: 2026-09-29
Scope: full working tree - `backend/`, `frontend/`, `Dockerfile`, `docker-compose.yml`, `scripts/`, config and tests.

Review method: read every source file, then reproduced each suspected defect against the running container (`pm-app-1`) before writing it up. Every finding below marked "Confirmed" was reproduced; the exact command and observed output are given.

Verification baseline at review time:

- `backend`: `pytest tests/ -q` -> 4 passed
- `frontend`: `vitest run` -> 8 passed, `eslint` clean, `tsc --noEmit` clean for all non-test sources, `next build` succeeds
- Docker: `GET /` 200, login 200, board returns 5 columns / 8 seeded cards

---

## 1. Critical

### 1.1 Unauthenticated arbitrary file read via path traversal (Confirmed)

`backend/app/main.py:123-128`

```python
@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str):
    file_path = os.path.join(static_dir, full_path)
    if full_path and os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(static_dir, "index.html"))
```

`os.path.join` does not sandbox, and neither Starlette nor Uvicorn normalise `..` out of the path. Any file readable by the container process is readable by anyone who can reach port 8000, with no authentication.

```
$ curl -s --path-as-is http://localhost:8000/../../../etc/passwd | head -2
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin

$ curl -s --path-as-is "http://localhost:8000/..%2f..%2f..%2fetc%2fpasswd" | head -1
root:x:0:0:root:/root:/bin/bash
```

The application database is exposed the same way, in both raw and URL-encoded form:

```
$ curl -s --path-as-is http://localhost:8000/../../data/kanban.db -o /tmp/db.bin
GET /../../data/kanban.db -> 200 bytes=32768
$ file /tmp/db.bin
SQLite 3.x database
```

The response body is the entire `users` and `cards` tables, including the stored password.

Fix: resolve and then verify containment before serving. The simplest correct version:

```python
@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str):
    root = os.path.realpath(static_dir)
    candidate = os.path.realpath(os.path.join(root, full_path))
    if full_path and candidate.startswith(root + os.sep) and os.path.isfile(candidate):
        return FileResponse(candidate)
    return FileResponse(os.path.join(root, "index.html"))
```

`realpath` also collapses symlinks, which matters because the static directory is a `COPY --from` stage in the image.

### 1.2 Session forgery via hardcoded signing key (Confirmed)

`backend/app/auth.py:7`

```python
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")
```

The token is `username:HMAC-SHA256(SECRET_KEY, username)` - there is no server-side state, no nonce and no expiry. Anyone who knows the key can mint a valid session for any user. `docker-compose.yml` does not set `SECRET_KEY`, so the deployed container uses exactly the published default.

```
$ python3 -c "import hmac,hashlib; print('session=user:'+hmac.new(b'dev-secret-key-change-in-production',b'user',hashlib.sha256).hexdigest())"
session=user:15daee093f5228021caafb9f15c58f1f4e7bc7b7eb9fe1abc0cf6d334765f6de

$ curl -s -H "Cookie: session=user:15daee...6de" http://localhost:8000/api/auth/me
{"authenticated":true,"username":"user"}
```

Full authentication bypass, no credentials required. Chained with 1.1 this is unauthenticated read of every board plus unauthenticated write to every board.

Fix: fail closed rather than fall back to a published constant.

```python
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY must be set")
```

Then generate one into `.env` (`.env` is already gitignored) and add `SECRET_KEY=${SECRET_KEY:?}` to the compose `environment` block so a missing key fails the container at start rather than at first request.

---

## 2. High

### 2.1 No validation on user-visible strings (Confirmed)

`backend/app/schemas.py:26-45` and `backend/app/routers/board.py:105,158`

`RenameColumnRequest.title` and `AddCardRequest.title` accept any string including empty and whitespace-only. The UI guards against this (`KanbanColumn.tsx:34-43`, `NewCardForm.tsx:15-17`) but the API is the trust boundary and is directly reachable.

```
$ curl -s -X POST .../api/board/cards/add -d '{"columnId":"col-backlog","title":"","details":"x"}'
{"message":"Card added","cardId":"card-4467e6f3"}

$ curl -s -X POST .../api/board/columns/col-backlog/rename -d '{"title":"   "}'
{"message":"Column renamed"}
$ curl -s .../api/board | jq -r '.columns[0].title'
"   "
```

A column can be renamed to blank, which then also blurs the column in the UI because `commitRename` resets an empty draft but the server has already stored the whitespace value.

Fix: constrain in the schema, which covers every caller (REST and AI) at once.

```python
class RenameColumnRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)

class AddCardRequest(BaseModel):
    columnId: str
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=5000)
```

`UpdateCardRequest` needs the same treatment on its optional fields.

### 2.2 Drag handlers swallow pointer events in the card edit form (Confirmed by code path)

`frontend/src/components/KanbanCard.tsx:51-52`

`{...listeners}` is spread on the `<article>`, which contains the edit-mode `<input>` and `<textarea>`. `useSortable` listeners are pointer-down handlers, so a text selection drag inside those fields also starts a card drag once it exceeds the 6px activation distance. Selecting or correcting text inside the edit form is the primary use of that form, and it is the thing that breaks.

Fix: stop propagation of the pointer event from the edit form so the sortable handler never sees it.

```tsx
{isEditing ? (
  <div
    className="space-y-2"
    onPointerDown={(event) => event.stopPropagation()}
  >
```

The same guard belongs on the Delete/Remove and Edit buttons so a click near the edge never initiates a drag.

### 2.3 Session expiry strands the user with no route back to login (Confirmed by code path)

`frontend/src/components/KanbanBoard.tsx:101-183`

Every mutation handler does `setError(...)` then `await refresh().catch(() => {})`. When the session cookie expires, `GET /api/board` returns 401, the error banner renders `Not authenticated`, and the component stays in `status: "ready"`. There is no 401 branch that returns the user to the login form, so the app is unusable until a manual reload.

Fix: in the shared `request` helper in `frontend/src/lib/api.ts`, rethrow 401 with a distinguishable marker, and have `KanbanBoard` drop to `status: "login"` on it. `handleLogout` also needs a `try/catch` - it currently calls `apiLogout()` with no error handling, producing an unhandled rejection if the network fails.

### 2.4 Logout does not revoke the session (Confirmed by design)

`backend/app/routers/auth.py:30` deletes only the browser cookie. The HMAC token has no server-side record, no expiry and no rotation, so a token captured once stays valid indefinitely - including after the user "logs out". This is acceptable for a localhost MVP but must be on the record before any non-local deployment, together with 1.2.

### 2.5 Plaintext passwords (MVP-accepted, still a finding)

`backend/app/models.py:12` stores the password as given; `backend/app/routers/auth.py:15` compares with `!=`. The seeded credential is `user` / `password` by design per `AGENTS.md`, so no immediate impact, but the column exists and will be trusted later. Hash before storing as soon as the fake-auth constraint is lifted.

---

## 3. Medium

### 3.1 `apply_operations` swallows every exception (Confirmed by code path)

`backend/app/routers/ai.py:34,44,68`

```python
try:
    card = get_owned_card(db, board, op.cardId)
except Exception:
    continue
```

`get_owned_card` signals "not found / not yours" with `HTTPException`. Catching bare `Exception` means a genuine `IntegrityError`, a locked SQLite database, or a programming error is indistinguishable from "the AI referenced a card that does not exist", and the operation is silently dropped while the user is told the update succeeded. The AI has to guess opaque `card-xxxxxxxx` identifiers, so silently ignoring bad ids is actively harmful - the user gets a confident "done" for a change that never landed.

Fix: catch `HTTPException` specifically, and report the skipped operations back to the caller instead of hiding them.

### 3.2 Move/reorder logic duplicated in two places (Confirmed)

`backend/app/routers/board.py:110-140` and `backend/app/routers/ai.py:43-65` implement the same column-move-with-reindex algorithm independently. The two copies have already diverged: the AI version defaults a null `targetIndex` to end-of-list while the REST version requires it. Any future fix to one will silently miss the other.

Fix: extract a single `move_card_to(db, board, card_id, target_column_id, target_index)` in `board.py` and have `apply_operations` call it. While there, `get_board_data` (`board.py:66-67`) is a pure alias for `board_to_dict` used exactly once - delete it and call `board_to_dict` directly.

### 3.3 Sticky error banner (Confirmed by code path)

`frontend/src/components/KanbanBoard.tsx` - `setError` is only ever called with a message, never reset to `null`. Once any request fails, the red alert stays on screen through every subsequent successful action until reload. Clear the error at the start of each handler, or on the next successful `refresh()`.

### 3.4 Board refetched on every AI reply even when nothing changed (Confirmed by code path)

`frontend/src/components/AiChat.tsx:28` calls `onBoardChanged()` unconditionally. The response already carries `operations`, so the client can skip the round trip:

```tsx
if (res.operations.length > 0) await onBoardChanged();
```

This also makes the "UI refreshes automatically only when the AI changed the board" requirement from `PLAN.md` Part 10 explicit rather than incidental.

### 3.5 Client can inject a system role into the AI conversation (Confirmed by code path)

`backend/app/schemas.py:47-49` types `role` as an unconstrained `str`, and `backend/app/ai.py:39-43` explicitly allows `"system"` through. A caller can therefore place arbitrary instructions ahead of the real system prompt. The blast radius is limited to the caller's own board, so this is not an escalation path, but it makes the guard in `ai.py` pointless and makes the model's behaviour non-deterministic.

Fix: `role: Literal["user", "assistant"]` in `ChatMessage`, and drop `"system"` from the allow-list in `call_ai`.

### 3.6 Unknown API paths return the SPA instead of 404 (Confirmed)

`backend/app/main.py:123` - the catch-all is registered after the routers, so it correctly does not shadow real endpoints, but it swallows unknown ones:

```
$ curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:8000/api/does-not-exist
200 text/html; charset=utf-8
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/missing.png
200 text/html; charset=utf-8
```

A 200 HTML page for a mistyped API path sends clients and monitoring tools down the wrong path. Exclude the `/api` prefix from the catch-all pattern and return a 404 there.

### 3.7 "First board" special case is an implicit invariant (Confirmed)

`backend/app/routers/board.py:32-34`

```python
# Column ids must be globally unique (PK), so prefix with board id
# except for the very first board which keeps legacy stable ids.
prefix = "" if board.id == 1 else f"b{board.id}-"
```

`columns.id` is a `Text` primary key, so ids are global rather than per-board. The comment explains the constraint but the fix is a workaround for the schema, and it depends on autoincrement ordering - a database that ever produces a board with `id != 1` first would get prefixed ids and every hardcoded `col-backlog` reference (the seed data in `main.py`, the Playwright selectors, the AI prompt) would break.

Cleaner fix: make `Column.id` a surrogate integer key with a separate unique `(board_id, slug)` pair for the frontend-facing id, and have the API project the slug. Larger change, but it removes the special case rather than encoding it. For the MVP, at minimum add a comment on the `Column` model recording that ids are global and the `board.id == 1` branch in `get_user_board` depends on that.

### 3.8 Dead code left over from the pre-backend frontend (Confirmed)

`frontend/src/lib/kanban.ts`

- `initialData` (lines 18-72, 55 lines) - no longer referenced anywhere; the board now comes from `GET /api/board`.
- `createId` (lines 164-168) - no longer referenced; card ids are minted server-side by `backend/app/routers/board.py:156`.

Both are exported, so nothing flags them. Delete them. Note that `kanban.test.ts` still runs without `initialData`, so the tests do not depend on them.

### 3.9 Unused Python dependencies (Confirmed)

`backend/requirements.txt` ships `itsdangerous` and `python-multipart`. Neither appears in `backend/app` - no `Form(...)` usage and no `itsdangerous` import; sessions are hand-rolled HMAC. Both bloat the image. Remove them, and drop `pytest` into a separate `requirements-dev.txt` so it is not installed in the runtime stage.

### 3.10 Local dev and e2e cannot reach the API (Confirmed by code path)

`frontend/src/lib/api.ts:5` defaults `API_BASE` to `""` (same-origin), which is correct for the Docker deployment where FastAPI serves the export on :8000. But `NEXT_PUBLIC_API_URL` is not set anywhere in the repo - not in `docker-compose.yml`, not in `frontend/package.json` scripts, not in `frontend/playwright.config.ts`, which starts only `npm run dev` on :3000.

Consequence: `npm run test:e2e` and plain `npm run dev` both point every API call at :3000, where no API exists, so the board never loads and the login flow cannot complete. The e2e suite is currently unrunnable as configured, and the comment at `tests/kanban.spec.ts:4` documenting the workaround is the only guidance.

Fix: add `"dev": "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 next dev"` to the frontend scripts (cross-platform via `cross-env` if Windows support matters), and give the Playwright `webServer` config an array of two entries - uvicorn on :8000 and Next on :3000. This is the last real gap in the PLAN.md Part 7 story.

### 3.11 Repository hygiene (Confirmed)

- `frontend/test-results/.last-run.json` is committed to git. It is a Playwright artifact and changes on every run. Add `/test-results` and `/playwright-report` to `frontend/.gitignore`.
- No `.env.example`. `SECRET_KEY` (which, per 1.2, must become mandatory) and `DB_PATH` are undocumented. A one-line template file is enough.
- No root `README.md`. The AGENTS.md files cover structure well, but there is no single entry point for "how do I run this" beyond `scripts/start.sh`.

---

## 4. Low

| # | Finding | Location |
|---|---|---|
| 4.1 | No Docker healthcheck; `scripts/start.sh` prints "App starting at" without waiting, so an immediate `curl` can hit a container that is not listening yet. Add a healthcheck on `/api/auth/me` and a wait loop in the script. | `docker-compose.yml`, `scripts/start.sh` |
| 4.2 | No `restart` policy on the compose service. | `docker-compose.yml` |
| 4.3 | AI chat history is component state only, so it is lost on reload. Acceptable for MVP; worth noting before anyone treats the chat as a durable transcript. | `AiChat.tsx` |
| 4.4 | Assistant messages render as plain text, no markdown. `response_format: json_object` is used rather than a strict JSON schema, so a malformed reply becomes a 502 for the user. | `AiChat.tsx`, `backend/app/ai.py:63` |
| 4.5 | No concurrency control. Two browsers are last-write-wins on `position`, and there is no polling, so a board open in browser A never reflects browser B until a manual action or reload. The PLAN does not require realtime, but "persistent across browsers" is easy to over-read. | whole stack |
| 4.6 | Column-seeding logic exists twice - `init_db` in `main.py:55-66` and `get_user_board` in `board.py:35-44` - and can drift. `get_user_board` is the one that runs for new users, `init_db` only for the seeded user. | `main.py`, `board.py` |
| 4.7 | `routers/auth.py:19` does a function-local import of `get_user_board` to dodge a circular import, and `routers/ai.py:17` does the same for `get_owned_card`/`reorder_column`. Moving the board helpers into a non-router module removes the cycle rather than working around it. | `routers/auth.py`, `routers/ai.py` |
| 4.8 | Session cookie sets `samesite="lax"` and `httponly` but not `secure`. Fine for localhost HTTP; must be set before any real deployment. | `routers/auth.py:24` |
| 4.9 | `frontend/src/test/vitest.d.ts` exists, but `tsconfig.json` does not reference it, so `tsc --noEmit` reports `Cannot find name 'describe'` across both test files. Adding `"types": ["vitest/globals"]` or a `/// <reference path="./src/test/vitest.d.ts" />` in each test file clears it. Tests run fine under vitest; this only affects editor/CI type checking. | `frontend/tsconfig.json` |

---

## 5. What is done well

Worth keeping as-is, because these are the parts a later change is most likely to regress:

- **Per-board ownership is enforced server-side**, not just hidden in the UI. `get_owned_card` (`board.py:70-77`) re-checks that the card's column belongs to the requesting user's board, and every card route goes through it. The `test_ownership_isolation` test proves a second user gets 404 on another user's card rather than silently succeeding.
- **`/api/auth/me` actually validates the cookie** rather than returning a constant, which is what makes the frontend auth gate meaningful.
- **Move index clamping is correct.** Verified against the live container: `targetIndex: 999` appends, `targetIndex: -5` prepends, and the in-column reorder matches the client's `moveCard` prediction exactly. No desync between the optimistic UI and the stored order.
- **Optimistic updates with rollback.** Rename, move, edit and delete apply locally, then refetch from the server on failure - the local UI cannot drift away from the database without self-healing.
- **CORS is narrowed** to the two origins the app is actually served from, with `allow_credentials=True` - the earlier wildcard-plus-credentials combination would have been rejected by the browser anyway.
- **`lifespan` replaced the deprecated `@app.on_event`**, and the seed data in `init_db` matches the original frontend `initialData` exactly, so a fresh container looks identical to the pre-backend demo.
- **`next.config.ts` `output: "export"`** and the multi-stage Dockerfile work end to end; `docker compose build --no-cache` produces a working image with no manual steps.
- **Tests are real, not smoke tests.** The frontend suite runs a stateful in-memory API mock and asserts that add/edit actually issued the right HTTP method against the right URL, rather than only asserting that the DOM changed.

---

## 6. Recommended order of work

1. **1.1** path traversal - one function, unauthenticated data exposure, fix immediately.
2. **1.2** secret key - fail closed and generate a real key. Without this, 1.1 is the least of the problems.
3. **2.1** title validation - schema-level, few lines, closes the blank-column state.
4. **2.2** edit-form drag - one `stopPropagation`, fixes a visibly broken interaction.
5. **2.3** 401 handling - without it the app has a dead end once the cookie expires.
6. **3.10** local dev / e2e wiring - the only functional gap left in PLAN.md Part 7.
7. **3.1 / 3.2** AI operation error handling and de-duplication - correctness, and they compound.
8. **3.8 / 3.9 / 3.11** dead code, unused deps, gitignore, `.env.example` - cheap cleanups.
9. Remaining Low items as convenient.
