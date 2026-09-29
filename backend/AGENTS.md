# Backend

FastAPI backend for the Kanban PM app.

## Structure

- `app/main.py` - FastAPI application entry point
- `app/database.py` - SQLAlchemy database setup (SQLite)
- `app/models.py` - Database models (User, Board, Column, Card)
- `app/schemas.py` - Pydantic request/response schemas
- `app/auth.py` - Session-based authentication (HMAC-signed cookies)
- `app/ai.py` - OpenRouter AI integration
- `app/routers/auth.py` - Login/logout endpoints
- `app/routers/board.py` - Board CRUD endpoints
- `app/routers/ai.py` - AI chat endpoint with structured outputs

## API Endpoints

- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/logout` - Logout
- `GET /api/board` - Get current user's board
- `POST /api/board/columns/{id}/rename` - Rename a column
- `POST /api/board/cards/move` - Move a card
- `POST /api/board/cards/add` - Add a card
- `PATCH /api/board/cards/{id}` - Update a card
- `DELETE /api/board/cards/{id}` - Delete a card
- `POST /api/ai/chat` - Chat with AI (returns structured operations)

## Database

SQLite database auto-created at `backend/data/kanban.db`. Default user: `user` / `password`.

## Running

```bash
cd backend
uv venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
uvicorn app.main:app --reload
```
