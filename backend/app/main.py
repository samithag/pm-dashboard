import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import Base, SessionLocal, engine
from app.models import Board, Card, Column, User
from app.routers import ai as ai_router
from app.routers import auth as auth_router
from app.routers import board as board_router
from app.routers.board import DEFAULT_COLUMNS

SEED_CARDS = {
    "col-backlog": [
        ("card-1", "Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
        ("card-2", "Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    ],
    "col-discovery": [
        ("card-3", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    ],
    "col-progress": [
        ("card-4", "Refine status language", "Standardize column labels and tone across the board."),
        ("card-5", "Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    ],
    "col-review": [
        ("card-6", "QA micro-interactions", "Verify hover, focus, and loading states."),
    ],
    "col-done": [
        ("card-7", "Ship marketing page", "Final copy approved and asset pack delivered."),
        ("card-8", "Close onboarding sprint", "Document release notes and share internally."),
    ],
}


def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "user").first()
        if not user:
            user = User(username="user", password="password")
            db.add(user)
            db.commit()
            db.refresh(user)

        board = db.query(Board).filter(Board.user_id == user.id).first()
        if not board:
            board = Board(user_id=user.id, name="My Board")
            db.add(board)
            db.commit()
            db.refresh(board)

        existing = {c.id for c in db.query(Column).filter(Column.board_id == board.id).all()}
        for position, (col_id, title) in enumerate(DEFAULT_COLUMNS):
            if col_id not in existing:
                db.add(Column(id=col_id, board_id=board.id, title=title, position=position))
        db.commit()

        if not db.query(Card).filter(Card.id.in_(["card-1", "card-8"])).first():
            for col_id, cards in SEED_CARDS.items():
                col = db.query(Column).filter(Column.id == col_id, Column.board_id == board.id).first()
                if not col:
                    continue
                pos = db.query(Card).filter(Card.column_id == col_id).count()
                for card_id, title, details in cards:
                    if db.query(Card).filter(Card.id == card_id).first():
                        continue
                    db.add(Card(id=card_id, column_id=col_id, title=title, details=details, position=pos))
                    pos += 1
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Kanban PM API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(board_router.router)
app.include_router(ai_router.router)


def resolve_static_dir() -> str | None:
    candidates = [
        os.environ.get("FRONTEND_DIR", ""),
        "/app/frontend/out",
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "out"),
    ]
    for path in candidates:
        if path and os.path.isdir(path):
            return path
    return None


static_dir = resolve_static_dir()
if static_dir:
    next_dir = os.path.join(static_dir, "_next")
    if os.path.isdir(next_dir):
        app.mount("/_next", StaticFiles(directory=next_dir), name="_next")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        file_path = os.path.join(static_dir, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(static_dir, "index.html"))
