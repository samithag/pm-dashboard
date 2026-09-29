import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.ai import call_ai
from app.auth import get_current_user
from app.database import get_db
from app.models import Board, Card, Column, User
from app.routers.board import get_board_data, get_user_board
from app.schemas import AIOperation, AIResponse, ChatMessage, ChatRequest

router = APIRouter(prefix="/api/ai", tags=["ai"])


def apply_operations(db: Session, board: Board, operations: list[AIOperation]):
    from app.routers.board import get_owned_card, reorder_column

    for op in operations:
        if op.type == "create_card" and op.columnId and op.title:
            col = db.query(Column).filter(Column.id == op.columnId, Column.board_id == board.id).first()
            if col:
                card_count = db.query(Card).filter(Card.column_id == op.columnId).count()
                card = Card(
                    id=f"card-{uuid.uuid4().hex[:8]}",
                    column_id=op.columnId,
                    title=op.title,
                    details=op.details or "",
                    position=card_count,
                )
                db.add(card)

        elif op.type == "update_card" and op.cardId:
            try:
                card = get_owned_card(db, board, op.cardId)
            except Exception:
                continue
            if op.title is not None:
                card.title = op.title
            if op.details is not None:
                card.details = op.details

        elif op.type == "move_card" and op.cardId and op.targetColumnId:
            try:
                card = get_owned_card(db, board, op.cardId)
            except Exception:
                continue
            target_col = db.query(Column).filter(
                Column.id == op.targetColumnId, Column.board_id == board.id
            ).first()
            if card and target_col:
                old_column_id = card.column_id
                card.column_id = op.targetColumnId
                db.flush()
                if old_column_id != op.targetColumnId:
                    reorder_column(db, old_column_id)
                target_cards = (
                    db.query(Card).filter(Card.column_id == op.targetColumnId).order_by(Card.position).all()
                )
                target_cards = [c for c in target_cards if c.id != op.cardId]
                idx = op.targetIndex if op.targetIndex is not None else len(target_cards)
                insert_idx = max(0, min(idx, len(target_cards)))
                target_cards.insert(insert_idx, card)
                for i, c in enumerate(target_cards):
                    c.position = i

        elif op.type == "delete_card" and op.cardId:
            try:
                card = get_owned_card(db, board, op.cardId)
            except Exception:
                continue
            column_id = card.column_id
            db.delete(card)
            db.flush()
            reorder_column(db, column_id)

        elif op.type == "rename_column" and op.columnId and op.title:
            col = db.query(Column).filter(Column.id == op.columnId, Column.board_id == board.id).first()
            if col:
                col.title = op.title

    db.commit()


@router.post("/chat")
async def chat(
    req: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    username = get_current_user(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")

    board = get_user_board(db, username)
    board_data = get_board_data(db, board)

    history = [msg.model_dump() for msg in req.history]
    try:
        ai_result = await call_ai(board_data, req.message, history)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI request failed: {e}")

    try:
        response = AIResponse(**ai_result)
    except Exception:
        raise HTTPException(status_code=502, detail="AI returned invalid response")

    if response.operations:
        apply_operations(db, board, response.operations)

    return response.model_dump()
