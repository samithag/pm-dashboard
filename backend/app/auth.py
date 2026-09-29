import hashlib
import hmac
import os

from fastapi import Request

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")
SESSION_COOKIE = "session"


def create_session_token(username: str) -> str:
    signature = hmac.new(SECRET_KEY.encode(), username.encode(), hashlib.sha256).hexdigest()
    return f"{username}:{signature}"


def verify_session_token(token: str) -> str | None:
    try:
        username, signature = token.split(":", 1)
        expected = hmac.new(SECRET_KEY.encode(), username.encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(signature, expected):
            return username
    except (ValueError, AttributeError):
        pass
    return None


def get_current_user(request: Request) -> str | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    return verify_session_token(token)
