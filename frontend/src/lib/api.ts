import type { BoardData } from "@/lib/kanban";

// Same-origin by default (Docker serves frontend + API on :8000).
// For local dev (Next on :3000, API on :8000) set NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export type ChatMessage = { role: string; content: string };
export type ChatResponse = { message: string; operations: unknown[] };

export const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // keep default message
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const apiLogin = (username: string, password: string) =>
  request<{ message: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const apiLogout = () =>
  request<{ message: string }>("/api/auth/logout", { method: "POST" });

export const apiMe = () =>
  request<{ authenticated: boolean; username: string }>("/api/auth/me");

export const apiBoard = () => request<BoardData>("/api/board");

export const apiRenameColumn = (columnId: string, title: string) =>
  request<{ message: string }>(`/api/board/columns/${columnId}/rename`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });

export const apiMoveCard = (
  cardId: string,
  targetColumnId: string,
  targetIndex: number
) =>
  request<{ message: string }>("/api/board/cards/move", {
    method: "POST",
    body: JSON.stringify({ cardId, targetColumnId, targetIndex }),
  });

export const apiAddCard = (columnId: string, title: string, details: string) =>
  request<{ message: string; cardId: string }>("/api/board/cards/add", {
    method: "POST",
    body: JSON.stringify({ columnId, title, details }),
  });

export const apiUpdateCard = (cardId: string, title: string, details: string) =>
  request<{ message: string }>(`/api/board/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify({ title, details }),
  });

export const apiDeleteCard = (cardId: string) =>
  request<{ message: string }>(`/api/board/cards/${cardId}`, {
    method: "DELETE",
  });

export const apiChat = (message: string, history: ChatMessage[]) =>
  request<ChatResponse>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
