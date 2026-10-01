import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Board, Card, Column, User
from app.schemas import (
    AddCardRequest,
    BoardData,
    CardSchema,
    ColumnSchema,
    MoveCardRequest,
    RenameColumnRequest,
    UpdateCardRequest,
)

router = APIRouter(prefix="/api/board", tags=["board"])

DEFAULT_COLUMNS = [
    ("col-backlog", "Backlog"),
    ("col-discovery", "Discovery"),
    ("col-progress", "In Progress"),
    ("col-review", "Review"),
    ("col-done", "Done"),
]


def get_user_board(db: Session, username: str) -> Board:
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    board = db.query(Board).filter(Board.user_id == user.id).first()
    if not board:
        board = Board(user_id=user.id, name="My Board")
        db.add(board)
        db.commit()
        db.refresh(board)
        # Column ids must be globally unique (PK), so prefix with board id
        # except for the very first board which keeps legacy stable ids.
        prefix = "" if board.id == 1 else f"b{board.id}-"
        for position, (column_id, title) in enumerate(DEFAULT_COLUMNS):
            db.add(Column(id=f"{prefix}{column_id}", board_id=board.id, title=title, position=position))
        db.commit()
    return board


def get_request_board(request: Request, db: Session) -> Board:
    username = get_current_user(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return get_user_board(db, username)


def board_to_dict(db: Session, board: Board) -> dict:
    columns = db.query(Column).filter(Column.board_id == board.id).order_by(Column.position).all()
    column_ids = [c.id for c in columns]
    cards = db.query(Card).filter(Card.column_id.in_(column_ids)).all() if column_ids else []

    column_schemas = []
    card_dict = {}
    for col in columns:
        col_cards = sorted((c for c in cards if c.column_id == col.id), key=lambda c: c.position)
        column_schemas.append(ColumnSchema(id=col.id, title=col.title, cardIds=[c.id for c in col_cards]))
        for card in col_cards:
            card_dict[card.id] = CardSchema(id=card.id, title=card.title, details=card.details)

    return BoardData(columns=column_schemas, cards=card_dict).model_dump()


def get_owned_column(db: Session, board: Board, column_id: str) -> Column | None:
    return db.query(Column).filter(Column.id == column_id, Column.board_id == board.id).first()


def get_owned_card(db: Session, board: Board, card_id: str) -> Card:
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card or not get_owned_column(db, board, card.column_id):
        raise HTTPException(status_code=404, detail="Card not found")
    return card


def reorder_column(db: Session, column_id: str):
    cards = db.query(Card).filter(Card.column_id == column_id).order_by(Card.position).all()
    for i, c in enumerate(cards):
        c.position = i


def add_card_to_column(db: Session, column_id: str, title: str, details: str) -> Card:
    position = db.query(Card).filter(Card.column_id == column_id).count()
    card = Card(id=f"card-{uuid.uuid4().hex[:8]}", column_id=column_id, title=title, details=details, position=position)
    db.add(card)
    return card


def move_card_to(db: Session, card: Card, target_column_id: str, target_index: int | None):
    """Move a card to target_index in the target column (None appends) and renumber positions."""
    old_column_id = card.column_id
    card.column_id = target_column_id
    db.flush()
    if old_column_id != target_column_id:
        reorder_column(db, old_column_id)

    target_cards = db.query(Card).filter(Card.column_id == target_column_id).order_by(Card.position).all()
    target_cards = [c for c in target_cards if c.id != card.id]
    if target_index is None:
        target_index = len(target_cards)
    target_cards.insert(max(0, min(target_index, len(target_cards))), card)
    for i, c in enumerate(target_cards):
        c.position = i


def delete_card_and_reorder(db: Session, card: Card):
    column_id = card.column_id
    db.delete(card)
    db.flush()
    reorder_column(db, column_id)


@router.get("")
@router.get("/")
def get_board(request: Request, db: Session = Depends(get_db)):
    board = get_request_board(request, db)
    return board_to_dict(db, board)


@router.post("/columns/{column_id}/rename")
def rename_column(column_id: str, req: RenameColumnRequest, request: Request, db: Session = Depends(get_db)):
    board = get_request_board(request, db)
    column = get_owned_column(db, board, column_id)
    if not column:
        raise HTTPException(status_code=404, detail="Column not found")
    column.title = req.title
    db.commit()
    return {"message": "Column renamed"}


@router.post("/cards/move")
def move_card(req: MoveCardRequest, request: Request, db: Session = Depends(get_db)):
    board = get_request_board(request, db)
    card = get_owned_card(db, board, req.cardId)
    if not get_owned_column(db, board, req.targetColumnId):
        raise HTTPException(status_code=404, detail="Target column not found")
    move_card_to(db, card, req.targetColumnId, req.targetIndex)
    db.commit()
    return {"message": "Card moved"}


@router.post("/cards/add")
def add_card(req: AddCardRequest, request: Request, db: Session = Depends(get_db)):
    board = get_request_board(request, db)
    if not get_owned_column(db, board, req.columnId):
        raise HTTPException(status_code=404, detail="Column not found")
    card = add_card_to_column(db, req.columnId, req.title, req.details)
    db.commit()
    return {"message": "Card added", "cardId": card.id}


@router.patch("/cards/{card_id}")
def update_card(card_id: str, req: UpdateCardRequest, request: Request, db: Session = Depends(get_db)):
    board = get_request_board(request, db)
    card = get_owned_card(db, board, card_id)
    if req.title is not None:
        card.title = req.title
    if req.details is not None:
        card.details = req.details
    db.commit()
    return {"message": "Card updated"}


@router.delete("/cards/{card_id}")
def delete_card(card_id: str, request: Request, db: Session = Depends(get_db)):
    board = get_request_board(request, db)
    card = get_owned_card(db, board, card_id)
    delete_card_and_reorder(db, card)
    db.commit()
    return {"message": "Card deleted"}
