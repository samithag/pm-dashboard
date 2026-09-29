import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";

let serverBoard: BoardData;
let cardCounter: number;

const baseBoard = (): BoardData => ({
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1"] },
    { id: "col-discovery", title: "Discovery", cardIds: [] },
    { id: "col-progress", title: "In Progress", cardIds: [] },
    { id: "col-review", title: "Review", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
  cards: {
    "card-1": { id: "card-1", title: "First card", details: "Notes" },
  },
});

const json = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

const installFetchMock = ({ loggedIn = true }: { loggedIn?: boolean } = {}) => {
  serverBoard = baseBoard();
  cardCounter = 100;
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/me")) {
      return loggedIn
        ? json({ authenticated: true, username: "user" })
        : json({ detail: "Not authenticated" }, 401);
    }
    if (url.endsWith("/api/auth/login")) {
      return json({ message: "Logged in" });
    }
    if (url.endsWith("/api/auth/logout")) {
      return json({ message: "Logged out" });
    }
    if (url.endsWith("/api/board") && method === "GET") {
      return json(structuredClone(serverBoard));
    }
    if (url.includes("/api/board/columns/") && url.endsWith("/rename")) {
      const columnId = url.split("/api/board/columns/")[1].split("/rename")[0];
      const body = JSON.parse((init?.body as string) ?? "{}");
      const column = serverBoard.columns.find((c) => c.id === columnId);
      if (column) column.title = body.title;
      return json({ message: "Column renamed" });
    }
    if (url.endsWith("/api/board/cards/add") && method === "POST") {
      const body = JSON.parse((init?.body as string) ?? "{}");
      const id = `card-new-${cardCounter++}`;
      serverBoard.cards[id] = { id, title: body.title, details: body.details };
      serverBoard.columns
        .find((c) => c.id === body.columnId)
        ?.cardIds.push(id);
      return json({ message: "Card added", cardId: id });
    }
    if (url.endsWith("/api/board/cards/move") && method === "POST") {
      const body = JSON.parse((init?.body as string) ?? "{}");
      for (const column of serverBoard.columns) {
        column.cardIds = column.cardIds.filter((id) => id !== body.cardId);
      }
      const target = serverBoard.columns.find((c) => c.id === body.targetColumnId);
      target?.cardIds.splice(
        Math.min(body.targetIndex, target.cardIds.length),
        0,
        body.cardId
      );
      return json({ message: "Card moved" });
    }
    const cardMatch = url.match(/\/api\/board\/cards\/([^/]+)$/);
    if (cardMatch && method === "PATCH") {
      const body = JSON.parse((init?.body as string) ?? "{}");
      const card = serverBoard.cards[cardMatch[1]];
      if (body.title !== undefined) card.title = body.title;
      if (body.details !== undefined) card.details = body.details;
      return json({ message: "Card updated" });
    }
    if (cardMatch && method === "DELETE") {
      delete serverBoard.cards[cardMatch[1]];
      for (const column of serverBoard.columns) {
        column.cardIds = column.cardIds.filter((id) => id !== cardMatch[1]);
      }
      return json({ message: "Card deleted" });
    }
    if (url.endsWith("/api/ai/chat")) {
      return json({ message: "Done", operations: [] });
    }
    return json({ detail: "Not found" }, 404);
  });
  vi.stubGlobal("fetch", mock as unknown as typeof fetch);
  return mock;
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the login form when not authenticated", async () => {
    installFetchMock({ loggedIn: false });
    render(<KanbanBoard />);
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByTestId("column-col-backlog")).not.toBeInTheDocument();
  });

  it("logs in and renders five columns from the API", async () => {
    installFetchMock({ loggedIn: false });
    render(<KanbanBoard />);
    await userEvent.type(await screen.findByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() =>
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5)
    );
  });

  it("renames a column", async () => {
    installFetchMock();
    render(<KanbanBoard />);
    await waitFor(() =>
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5)
    );
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card via the API", async () => {
    const fetchMock = installFetchMock();
    render(<KanbanBoard />);
    await waitFor(() =>
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5)
    );
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await within(column).findByText("New card")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).endsWith("/api/board/cards/add")
      )
    ).toBe(true);

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    await waitFor(() =>
      expect(within(column).queryByText("New card")).not.toBeInTheDocument()
    );
  });

  it("edits a card via the API", async () => {
    const fetchMock = installFetchMock();
    render(<KanbanBoard />);
    await waitFor(() =>
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5)
    );
    await userEvent.click(
      screen.getByRole("button", { name: /edit first card/i })
    );
    const titleInput = screen.getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated card");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("Updated card")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          String(call[0]).includes("/api/board/cards/card-1") &&
          (call[1] as RequestInit)?.method === "PATCH"
      )
    ).toBe(true);
  });
});
