"use client";

import { useState, type FormEvent } from "react";
import { apiChat, type ChatMessage } from "@/lib/api";

type AiChatProps = {
  onBoardChanged: () => Promise<void>;
};

export const AiChat = ({ onBoardChanged }: AiChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await apiChat(text, messages);
      setMessages([...next, { role: "assistant", content: res.message }]);
      await onBoardChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <aside
      className="flex min-h-[520px] w-full flex-col rounded-3xl border border-[var(--stroke)] bg-white/80 p-4 shadow-[var(--shadow)] backdrop-blur lg:w-[320px] lg:shrink-0"
      data-testid="ai-chat"
    >
      <div className="flex items-center gap-3">
        <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
        <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
          AI Assistant
        </h2>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--gray-text)]">
        Ask me to create, edit, or move cards.
      </p>
      <div className="mt-4 flex flex-1 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            No messages yet
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === "user"
                ? "self-end rounded-2xl rounded-br-sm bg-[var(--primary-blue)] px-3 py-2 text-sm text-white"
                : "self-start rounded-2xl rounded-bl-sm bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)]"
            }
          >
            {msg.content}
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about your board"
          aria-label="Chat message"
          className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={sending}
          className="shrink-0 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {sending ? "..." : "Send"}
        </button>
      </form>
    </aside>
  );
};
