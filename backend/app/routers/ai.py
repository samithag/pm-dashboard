from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.ai import call_ai
from app.database import get_db
from app.models import Board
from app.routers.board import (
    add_card_to_column,
    board_to_dict,
    delete_card_and_reorder,
    get_owned_card,
    get_owned_column,
    get_request_board,
    move_card_to,
)
from app.schemas import AIOperation, AIResponse, ChatRequest

router = APIRouter(prefix="/api/ai", tags=["ai"])


def apply_operations(db: Session, board: Board, operations: list[AIOperation]):
    for op in operations:
        if op.type == "create_card" and op.columnId and op.title:
            if get_owned_column(db, board, op.columnId):
                add_card_to_column(db, op.columnId, op.title, op.details or "")

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
            if get_owned_column(db, board, op.targetColumnId):
                move_card_to(db, card, op.targetColumnId, op.targetIndex)

        elif op.type == "delete_card" and op.cardId:
            try:
                card = get_owned_card(db, board, op.cardId)
            except Exception:
                continue
            delete_card_and_reorder(db, card)

        elif op.type == "rename_column" and op.columnId and op.title:
            column = get_owned_column(db, board, op.columnId)
            if column:
                column.title = op.title

    db.commit()


@router.post("/chat")
async def chat(req: ChatRequest, request: Request, db: Session = Depends(get_db)):
    board = get_request_board(request, db)
    board_data = board_to_dict(db, board)

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
