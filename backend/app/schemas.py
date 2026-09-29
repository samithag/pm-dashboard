from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class CardSchema(BaseModel):
    id: str
    title: str
    details: str


class ColumnSchema(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[ColumnSchema]
    cards: dict[str, CardSchema]


class RenameColumnRequest(BaseModel):
    title: str


class MoveCardRequest(BaseModel):
    cardId: str
    targetColumnId: str
    targetIndex: int


class AddCardRequest(BaseModel):
    columnId: str
    title: str
    details: str = ""


class UpdateCardRequest(BaseModel):
    title: str | None = None
    details: str | None = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class AIOperation(BaseModel):
    type: str
    cardId: str | None = None
    columnId: str | None = None
    title: str | None = None
    details: str | None = None
    targetColumnId: str | None = None
    targetIndex: int | None = None


class AIResponse(BaseModel):
    message: str
    operations: list[AIOperation] = []
