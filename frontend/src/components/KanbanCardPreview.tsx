import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="w-[260px] rotate-[1.5deg] rounded-xl border border-[rgba(32,157,215,0.4)] bg-white px-3.5 py-3 shadow-[var(--card-shadow-hover)]">
    <h4 className="font-display text-[15px] font-semibold leading-snug text-[var(--navy-dark)]">
      {card.title}
    </h4>
    {card.details && (
      <p className="mt-1.5 line-clamp-3 text-[13px] leading-5 text-[var(--gray-text)]">
        {card.details}
      </p>
    )}
  </article>
);
