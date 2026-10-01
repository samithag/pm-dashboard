"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CircleAlert, KanbanSquare, Layers, LoaderCircle, LogOut } from "lucide-react";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { LoginForm } from "@/components/LoginForm";
import { AiChat } from "@/components/AiChat";
import { moveCard, type BoardData } from "@/lib/kanban";
import {
  apiAddCard,
  apiBoard,
  apiDeleteCard,
  apiLogout,
  apiMe,
  apiMoveCard,
  apiRenameColumn,
  apiUpdateCard,
  errorMessage,
} from "@/lib/api";

type Status = "loading" | "login" | "ready";

const COLUMN_ACCENTS = ["#209dd7", "#753991", "#ecad0a", "#0e9f6e", "#e5486f"];

export const KanbanBoard = () => {
  const [status, setStatus] = useState<Status>("loading");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const refresh = useCallback(async () => {
    const data = await apiBoard();
    setBoard(data);
  }, []);

  useEffect(() => {
    apiMe()
      .then(() => refresh())
      .then(() => setStatus("ready"))
      .catch(() => setStatus("login"));
  }, [refresh]);

  // Show the error, then resync with the server to undo the optimistic update.
  const recover = async (err: unknown, fallback: string) => {
    setError(errorMessage(err, fallback));
    await refresh().catch(() => {});
  };

  const handleLoginSuccess = async () => {
    setError(null);
    try {
      await refresh();
      setStatus("ready");
    } catch (err) {
      setError(errorMessage(err, "Failed to load board"));
    }
  };

  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch {
      // Cookie may already be gone; still return to login.
    }
    setBoard(null);
    setError(null);
    setStatus("login");
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id || !board) {
      return;
    }

    const activeId = active.id as string;
    const nextColumns = moveCard(board.columns, activeId, over.id as string);
    setBoard({ ...board, columns: nextColumns });

    const targetColumn = nextColumns.find((column) =>
      column.cardIds.includes(activeId)
    );
    if (!targetColumn) {
      return;
    }

    setError(null);
    apiMoveCard(
      activeId,
      targetColumn.id,
      targetColumn.cardIds.indexOf(activeId)
    ).catch((err) => recover(err, "Failed to move card"));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    if (!board) return;
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            columns: prev.columns.map((column) =>
              column.id === columnId ? { ...column, title } : column
            ),
          }
        : prev
    );
    setError(null);
    apiRenameColumn(columnId, title).catch((err) =>
      recover(err, "Failed to rename column")
    );
  };

  const handleAddCard = async (
    columnId: string,
    title: string,
    details: string
  ) => {
    setError(null);
    try {
      await apiAddCard(columnId, title, details || "No details yet.");
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Failed to add card"));
    }
  };

  const handleEditCard = async (
    cardId: string,
    title: string,
    details: string
  ) => {
    if (!board) return;
    setBoard((prev) =>
      prev && prev.cards[cardId]
        ? {
            ...prev,
            cards: { ...prev.cards, [cardId]: { id: cardId, title, details } },
          }
        : prev
    );
    setError(null);
    try {
      await apiUpdateCard(cardId, title, details);
    } catch (err) {
      await recover(err, "Failed to update card");
    }
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    if (!board) return;
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cards: Object.fromEntries(
          Object.entries(prev.cards).filter(([id]) => id !== cardId)
        ),
        columns: prev.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                cardIds: column.cardIds.filter((id) => id !== cardId),
              }
            : column
        ),
      };
    });
    setError(null);
    apiDeleteCard(cardId).catch((err) =>
      recover(err, "Failed to delete card")
    );
  };

  if (status === "login") {
    return (
      <div className="relative overflow-hidden">
        <LoginForm onSuccess={handleLoginSuccess} />
      </div>
    );
  }

  if (status === "loading" || !board) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[1500px] flex-col items-center justify-center gap-3 px-6">
        <LoaderCircle size={22} className="spinner text-[var(--primary-blue)]" />
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
          Loading board...
        </p>
      </main>
    );
  }

  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const totalCards = Object.keys(board.cards).length;

  return (
    <div className="relative min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--stroke)] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--navy-dark)] text-white shadow-sm">
            <Layers size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-semibold leading-tight text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
            <p className="hidden text-xs text-[var(--gray-text)] sm:block">
              Single Board Kanban
            </p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="flex items-center gap-1.5 rounded-full border border-[var(--stroke)] bg-[#f6f8fb] px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)]">
              <KanbanSquare size={13} className="text-[var(--primary-blue)]" />
              {board.columns.length} columns
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-[var(--stroke)] bg-[#f6f8fb] px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
              {totalCards} cards
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--stroke)] px-3.5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-65px)] max-w-[1500px] flex-col gap-5 px-4 pb-10 pt-5 sm:px-6">
        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-xl border border-[rgba(220,38,38,0.25)] bg-[rgba(220,38,38,0.06)] px-4 py-2.5 text-sm font-medium text-red-600">
            <CircleAlert size={15} className="shrink-0" />
            {error}
          </p>
        )}

        <div className="flex flex-1 flex-col gap-5 xl:flex-row xl:items-start">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section
              aria-label="Kanban board"
              className="scroll-slim flex flex-1 gap-4 overflow-x-auto pb-2 xl:flex-wrap xl:overflow-visible"
            >
              {board.columns.map((column, i) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  accent={COLUMN_ACCENTS[i % COLUMN_ACCENTS.length]}
                  cards={column.cardIds
                    .map((cardId) => board.cards[cardId])
                    .filter(Boolean)}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onEditCard={handleEditCard}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
            </section>
            <DragOverlay dropAnimation={null}>
              {activeCard ? <KanbanCardPreview card={activeCard} /> : null}
            </DragOverlay>
          </DndContext>
          <AiChat onBoardChanged={refresh} />
        </div>
      </main>
    </div>
  );
};
