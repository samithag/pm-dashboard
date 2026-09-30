import { useState } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CircleDashed } from "lucide-react";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  accent: string;
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onEditCard: (cardId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  accent,
  onRename,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [draft, setDraft] = useState(column.title);
  const [syncedTitle, setSyncedTitle] = useState(column.title);
  if (column.title !== syncedTitle) {
    setSyncedTitle(column.title);
    setDraft(column.title);
  }

  const commitRename = () => {
    const next = draft.trim();
    if (!next) {
      setDraft(column.title);
      return;
    }
    if (next !== column.title) {
      onRename(column.id, next);
    }
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex max-h-[calc(100vh-220px)] min-h-[420px] w-[288px] shrink-0 snap-start flex-col rounded-2xl border bg-[#eef1f6]/80 p-3 transition",
        isOver
          ? "border-[rgba(32,157,215,0.5)] ring-2 ring-[var(--ring)]"
          : "border-[var(--stroke)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center gap-2 px-1">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              (event.target as HTMLInputElement).blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent font-display text-[15px] font-semibold text-[var(--navy-dark)] outline-none transition rounded-md px-1 -mx-1 focus:bg-white focus:ring-2 focus:ring-[var(--ring)]"
          aria-label="Column title"
        />
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--gray-text)] shadow-sm">
          {cards.length}
        </span>
      </div>
      <div className="scroll-slim mt-3 flex flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(3,33,71,0.18)] px-3 py-8 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--gray-text)]">
            <CircleDashed size={18} className="opacity-60" />
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
