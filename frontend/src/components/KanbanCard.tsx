import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import type { Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, title: string, details: string) => void;
};

export const KanbanCard = ({ card, onDelete, onEdit }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSave = () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }
    onEdit(card.id, nextTitle, details.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTitle(card.title);
    setDetails(card.details);
    setIsEditing(false);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group rounded-xl border border-[var(--stroke)] bg-white px-3.5 py-3 shadow-[var(--card-shadow)]",
        "transition-all duration-150 hover:border-[rgba(32,157,215,0.4)] hover:shadow-[var(--card-shadow-hover)]",
        isDragging && "rotate-[1.5deg] opacity-90 shadow-[var(--card-shadow-hover)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <div
          className="space-y-2"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Card title"
            placeholder="Card title"
            className="w-full rounded-lg border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--ring)]"
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            aria-label="Card details"
            placeholder="Details"
            rows={3}
            className="w-full resize-none rounded-lg border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--ring)]"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-[var(--navy-dark)] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[var(--secondary-purple)]"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-full border border-[var(--stroke)] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-0.5 shrink-0 cursor-grab text-[var(--gray-text)] opacity-0 transition group-hover:opacity-60"
          >
            <GripVertical size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="font-display text-[15px] font-semibold leading-snug text-[var(--navy-dark)]">
              {card.title}
            </h4>
            {card.details && (
              <p className="mt-1.5 line-clamp-3 text-[13px] leading-5 text-[var(--gray-text)]">
                {card.details}
              </p>
            )}
          </div>
          <div
            className="flex shrink-0 items-center gap-0.5 md:opacity-0 md:transition md:group-hover:opacity-100 md:group-focus-within:opacity-100"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setTitle(card.title);
                setDetails(card.details);
                setIsEditing(true);
              }}
              className="rounded-lg p-1.5 text-[var(--gray-text)] transition hover:bg-[rgba(32,157,215,0.1)] hover:text-[var(--primary-blue)]"
              aria-label={`Edit ${card.title}`}
              title="Edit card"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className="rounded-lg p-1.5 text-[var(--gray-text)] transition hover:bg-[rgba(220,38,38,0.08)] hover:text-red-600"
              aria-label={`Delete ${card.title}`}
              title="Delete card"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
