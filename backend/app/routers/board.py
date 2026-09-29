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
        defaults = [
            (f"{prefix}col-backlog", "Backlog", 0),
            (f"{prefix}col-discovery", "Discovery", 1),
            (f"{prefix}col-progress", "In Progress", 2),
            (f"{prefix}col-review", "Review", 3),
            (f"{prefix}col-done", "Done", 4),
        ]
        for col_id, title, pos in defaults:
            db.add(Column(id=col_id, board_id=board.id, title=title, position=pos))
        db.commit()
    return board


def board_to_dict(board: Board, db: Session) -> dict:
    columns = db.query(Column).filter(Column.board_id == board.id).order_by(Column.position).all()
    column_ids = [c.id for c in columns]
    cards = db.query(Card).filter(Card.column_id.in_(column_ids)).all() if column_ids else []

    column_schemas = []
    card_dict = {}

    for col in columns:
        col_cards = [c for c in cards if c.column_id == col.id]
        col_cards.sort(key=lambda c: c.position)
        column_schemas.append(ColumnSchema(id=col.id, title=col.title, cardIds=[c.id for c in col_cards]))
        for card in col_cards:
            card_dict[card.id] = CardSchema(id=card.id, title=card.title, details=card.details)

    return BoardData(columns=column_schemas, cards=card_dict).model_dump()


def get_board_data(db: Session, board: Board) -> dict:
    return board_to_dict(board, db)


def get_owned_card(db: Session, board: Board, card_id: str) -> Card:
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    column = db.query(Column).filter(Column.id == card.column_id, Column.board_id == board.id).first()
    if not column:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


def reorder_column(db: Session, column_id: str):
    cards = db.query(Card).filter(Card.column_id == column_id).order_by(Card.position).all()
    for i, c in enumerate(cards):
        c.position = i


@router.get("")
@router.get("/")
def get_board(request: Request, db: Session = Depends(get_db)):
    username = get_current_user(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    board = get_user_board(db, username)
    return board_to_dict(board, db)


@router.post("/columns/{column_id}/rename")
def rename_column(column_id: str, req: RenameColumnRequest, request: Request, db: Session = Depends(get_db)):
    username = get_current_user(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    board = get_user_board(db, username)
    column = db.query(Column).filter(Column.id == column_id, Column.board_id == board.id).first()
    if not column:
        raise HTTPException(status_code=404, detail="Column not found")
    column.title = req.title
    db.commit()
    return {"message": "Column renamed"}


@router.post("/cards/move")
def move_card(req: MoveCardRequest, request: Request, db: Session = Depends(get_db)):
    username = get_current_user(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    board = get_user_board(db, username)

    card = get_owned_card(db, board, req.cardId)

    target_column = db.query(Column).filter(Column.id == req.targetColumnId, Column.board_id == board.id).first()
    if not target_column:
        raise HTTPException(status_code=404, detail="Target column not found")

    old_column_id = card.column_id
    card.column_id = req.targetColumnId
    db.flush()

    if old_column_id != req.targetColumnId:
        reorder_column(db, old_column_id)

    target_cards = db.query(Card).filter(Card.column_id == req.targetColumnId).order_by(Card.position).all()
    target_cards = [c for c in target_cards if c.id != req.cardId]

    insert_idx = max(0, min(req.targetIndex, len(target_cards)))
    target_cards.insert(insert_idx, card)

    for i, c in enumerate(target_cards):
        c.position = i

    db.commit()
    return {"message": "Card moved"}


@router.post("/cards/add")
def add_card(req: AddCardRequest, request: Request, db: Session = Depends(get_db)):
    username = get_current_user(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    board = get_user_board(db, username)

    column = db.query(Column).filter(Column.id == req.columnId, Column.board_id == board.id).first()
    if not column:
        raise HTTPException(status_code=404, detail="Column not found")

    card_count = db.query(Card).filter(Card.column_id == req.columnId).count()
    card = Card(
        id=f"card-{uuid.uuid4().hex[:8]}",
        column_id=req.columnId,
        title=req.title,
        details=req.details,
        position=card_count,
    )
    db.add(card)
    db.commit()
    return {"message": "Card added", "cardId": card.id}


@router.patch("/cards/{card_id}")
def update_card(card_id: str, req: UpdateCardRequest, request: Request, db: Session = Depends(get_db)):
    username = get_current_user(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    board = get_user_board(db, username)

    card = get_owned_card(db, board, card_id)

    if req.title is not None:
        card.title = req.title
    if req.details is not None:
        card.details = req.details

    db.commit()
    return {"message": "Card updated"}


@router.delete("/cards/{card_id}")
def delete_card(card_id: str, request: Request, db: Session = Depends(get_db)):
    username = get_current_user(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    board = get_user_board(db, username)

    card = get_owned_card(db, board, card_id)
    column_id = card.column_id

    db.delete(card)
    db.commit()
    reorder_column(db, column_id)
    db.commit()
    return {"message": "Card deleted"}
