"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "@/lib/api";

type Status = "loading" | "login" | "ready";

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

  const handleLoginSuccess = useCallback(async () => {
    try {
      await refresh();
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
    }
  }, [refresh]);

  const handleLogout = useCallback(async () => {
    await apiLogout();
    setBoard(null);
    setStatus("login");
  }, []);

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

    let targetColumnId = "";
    let targetIndex = 0;
    for (const column of nextColumns) {
      const index = column.cardIds.indexOf(activeId);
      if (index !== -1) {
        targetColumnId = column.id;
        targetIndex = index;
        break;
      }
    }
    if (!targetColumnId) {
      return;
    }

    apiMoveCard(activeId, targetColumnId, targetIndex).catch(async (err) => {
      setError(err instanceof Error ? err.message : "Failed to move card");
      await refresh().catch(() => {});
    });
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
    apiRenameColumn(columnId, title).catch(async (err) => {
      setError(err instanceof Error ? err.message : "Failed to rename column");
      await refresh().catch(() => {});
    });
  };

  const handleAddCard = async (
    columnId: string,
    title: string,
    details: string
  ) => {
    try {
      await apiAddCard(columnId, title, details || "No details yet.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add card");
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
    try {
      await apiUpdateCard(cardId, title, details);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update card");
      await refresh().catch(() => {});
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
    apiDeleteCard(cardId).catch(async (err) => {
      setError(err instanceof Error ? err.message : "Failed to delete card");
      await refresh().catch(() => {});
    });
  };

  const cardsById = useMemo(() => board?.cards ?? {}, [board]);
  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (status === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-[1500px] items-center justify-center px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
          Loading board...
        </p>
      </main>
    );
  }

  if (status === "login") {
    return (
      <div className="relative overflow-hidden">
        <LoginForm onSuccess={handleLoginSuccess} />
      </div>
    );
  }

  if (!board) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[1500px] items-center justify-center px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
          Loading board...
        </p>
      </main>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                Log out
              </button>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error}
            </p>
          )}
        </header>

        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid flex-1 gap-6 lg:grid-cols-5 xl:grid-cols-5">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds
                    .map((cardId) => board.cards[cardId])
                    .filter((card) => Boolean(card))}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onEditCard={handleEditCard}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          <AiChat onBoardChanged={refresh} />
        </div>
      </main>
    </div>
  );
};
