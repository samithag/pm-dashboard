from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE, create_session_token, get_current_user
from app.database import get_db
from app.models import Board, User
from app.schemas import LoginRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(request: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == request.username).first()
    if not user or user.password != request.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not db.query(Board).filter(Board.user_id == user.id).first():
        from app.routers.board import get_user_board

        get_user_board(db, user.username)

    token = create_session_token(user.username)
    response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="lax", max_age=86400, path="/")
    return {"message": "Logged in"}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"message": "Logged out"}


@router.get("/me")
def me(request: Request):
    username = get_current_user(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"authenticated": True, "username": username}
