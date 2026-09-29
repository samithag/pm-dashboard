from sqlalchemy import Column as SAColumn, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = SAColumn(Integer, primary_key=True)
    username = SAColumn(String, unique=True, nullable=False)
    password = SAColumn(String, nullable=False)

    boards = relationship("Board", back_populates="user", cascade="all, delete-orphan")


class Board(Base):
    __tablename__ = "boards"

    id = SAColumn(Integer, primary_key=True)
    user_id = SAColumn(Integer, ForeignKey("users.id"), nullable=False)
    name = SAColumn(String, nullable=False, default="My Board")

    user = relationship("User", back_populates="boards")
    columns = relationship("Column", back_populates="board", cascade="all, delete-orphan")


class Column(Base):
    __tablename__ = "columns"

    id = SAColumn(Text, primary_key=True)
    board_id = SAColumn(Integer, ForeignKey("boards.id"), nullable=False)
    title = SAColumn(Text, nullable=False)
    position = SAColumn(Integer, nullable=False, default=0)

    board = relationship("Board", back_populates="columns")
    cards = relationship("Card", back_populates="column", cascade="all, delete-orphan")


class Card(Base):
    __tablename__ = "cards"

    id = SAColumn(Text, primary_key=True)
    column_id = SAColumn(Text, ForeignKey("columns.id"), nullable=False)
    title = SAColumn(Text, nullable=False)
    details = SAColumn(Text, nullable=False, default="")
    position = SAColumn(Integer, nullable=False, default=0)

    column = relationship("Column", back_populates="cards")
