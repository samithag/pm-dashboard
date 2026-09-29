import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import User


@pytest.fixture()
def client(tmp_path):
    db_path = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Seed via API lifespan equivalent: create user/board/columns/cards
    # by calling init logic against test engine
    from app.models import Board, Card, Column

    db = TestingSession()
    user = User(username="user", password="password")
    db.add(user)
    db.commit()
    db.refresh(user)
    board = Board(user_id=user.id, name="My Board")
    db.add(board)
    db.commit()
    db.refresh(board)
    for i, (cid, title) in enumerate(
        [
            ("col-backlog", "Backlog"),
            ("col-discovery", "Discovery"),
            ("col-progress", "In Progress"),
            ("col-review", "Review"),
            ("col-done", "Done"),
        ]
    ):
        db.add(Column(id=cid, board_id=board.id, title=title, position=i))
    db.commit()
    seeds = [
        ("card-1", "col-backlog", "Align roadmap themes", "Draft quarterly themes.", 0),
        ("card-2", "col-backlog", "Gather customer signals", "Review feedback.", 1),
        ("card-3", "col-discovery", "Prototype analytics view", "Sketch layout.", 0),
        ("card-4", "col-progress", "Refine status language", "Standardize labels.", 0),
        ("card-5", "col-progress", "Design card layout", "Add hierarchy.", 1),
        ("card-6", "col-review", "QA micro-interactions", "Verify states.", 0),
        ("card-7", "col-done", "Ship marketing page", "Final copy.", 0),
        ("card-8", "col-done", "Close onboarding sprint", "Release notes.", 1),
    ]
    for cid, col, title, details, pos in seeds:
        db.add(Card(id=cid, column_id=col, title=title, details=details, position=pos))
    db.commit()
    db.close()

    with TestClient(app) as c:
        c.test_session_factory = TestingSession  # type: ignore
        yield c

    app.dependency_overrides.clear()


def login(client):
    r = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert r.status_code == 200


def test_auth_flow(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/board").status_code == 401
    assert client.post("/api/auth/login", json={"username": "user", "password": "wrong"}).status_code == 401
    login(client)
    assert client.get("/api/auth/me").status_code == 200
    board = client.get("/api/board").json()
    assert len(board["columns"]) == 5
    assert len(board["cards"]) == 8


def test_card_crud(client):
    login(client)
    r = client.post("/api/board/cards/add", json={"columnId": "col-backlog", "title": "T", "details": "D"})
    assert r.status_code == 200
    cid = r.json()["cardId"]

    assert client.patch(f"/api/board/cards/{cid}", json={"title": "T2"}).status_code == 200
    assert client.post("/api/board/cards/move", json={"cardId": cid, "targetColumnId": "col-done", "targetIndex": 0}).status_code == 200

    board = client.get("/api/board").json()
    done = next(c for c in board["columns"] if c["id"] == "col-done")
    assert done["cardIds"][0] == cid

    assert client.post("/api/board/columns/col-backlog/rename", json={"title": "Todo"}).status_code == 200
    assert client.delete(f"/api/board/cards/{cid}").status_code == 200


def test_ownership_isolation(client):
    # second user gets their own board; cannot touch first user's cards
    Session = client.test_session_factory
    db = Session()
    db.add(User(username="evil", password="evil"))
    db.commit()
    db.close()

    client.post("/api/auth/login", json={"username": "evil", "password": "evil"})
    assert client.get("/api/board").status_code == 200
    assert client.patch("/api/board/cards/card-1", json={"title": "x"}).status_code == 404


def test_ai_requires_key(client, monkeypatch):
    import app.ai as ai_mod

    monkeypatch.setattr(ai_mod, "OPENROUTER_API_KEY", "")
    login(client)
    r = client.post("/api/ai/chat", json={"message": "hi"})
    assert r.status_code == 502
