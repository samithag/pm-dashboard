"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, SendHorizontal, Sparkles, User } from "lucide-react";
import { apiChat, type ChatMessage } from "@/lib/api";

type AiChatProps = {
  onBoardChanged: () => Promise<void>;
};

export const AiChat = ({ onBoardChanged }: AiChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") {
      try {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        return;
      } catch {
        // jsdom and older engines may not support the options form
      }
    }
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

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
      if (res.operations.length > 0) {
        await onBoardChanged();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <aside
      className="flex max-h-[calc(100vh-220px)] min-h-[420px] w-full flex-col overflow-hidden rounded-2xl border border-[var(--stroke)] bg-white shadow-[var(--card-shadow)] xl:sticky xl:top-[76px] xl:w-[340px] xl:shrink-0"
      data-testid="ai-chat"
    >
      <div className="flex items-center gap-2.5 border-b border-[var(--stroke)] bg-gradient-to-r from-[rgba(117,57,145,0.08)] to-[rgba(32,157,215,0.08)] px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--secondary-purple)] text-white shadow-sm">
          <Sparkles size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-semibold leading-tight text-[var(--navy-dark)]">
            AI Assistant
          </h2>
          <p className="flex items-center gap-1.5 text-xs text-[var(--gray-text)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Create, edit, or move cards
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="scroll-slim flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !sending && (
          <div className="rounded-xl border border-dashed border-[rgba(3,33,71,0.18)] px-4 py-6 text-center">
            <Bot size={20} className="mx-auto text-[var(--gray-text)]" />
            <p className="mt-2 text-[13px] font-medium text-[var(--gray-text)]">
              Ask me to organize your board
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--gray-text)]">
              Try “Move urgent items to Review” or “Add a launch checklist to Backlog”.
            </p>
          </div>
        )}
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex items-start justify-end gap-2">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--navy-dark)] px-3.5 py-2.5 text-[13px] leading-5 text-white">
                {msg.content}
              </div>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(3,33,71,0.08)] text-[var(--navy-dark)]">
                <User size={14} />
              </span>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(117,57,145,0.12)] text-[var(--secondary-purple)]">
                <Bot size={14} />
              </span>
              <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-[var(--stroke)] bg-[#f6f8fb] px-3.5 py-2.5 text-[13px] leading-5 text-[var(--navy-dark)]">
                {msg.content}
              </div>
            </div>
          )
        )}
        {sending && (
          <div className="flex items-start gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(117,57,145,0.12)] text-[var(--secondary-purple)]">
              <Bot size={14} />
            </span>
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-[var(--stroke)] bg-[#f6f8fb] px-4 py-3">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--gray-text)]" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--gray-text)]" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--gray-text)]" />
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-[rgba(220,38,38,0.06)] px-3 py-2 text-[13px] font-medium text-red-600">
            {error}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[var(--stroke)] p-3">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--stroke)] bg-[#f6f8fb] px-2 py-1.5 transition focus-within:border-[var(--primary-blue)] focus-within:bg-white focus-within:ring-2 focus-within:ring-[var(--ring)]">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about your board"
            aria-label="Chat message"
            className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-[var(--navy-dark)] outline-none placeholder:text-[var(--gray-text)]"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label="Send chat message"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--secondary-purple)] text-white transition hover:brightness-110 disabled:opacity-40"
          >
            <SendHorizontal size={15} />
          </button>
        </div>
      </form>
    </aside>
  );
};
