import json
import os

import httpx

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-oss-120b"

SYSTEM_PROMPT = """You are a Kanban board assistant. You help users manage their project board.

You can create, update, move, and delete cards, and rename columns.

Respond with JSON in this exact format:
{
  "message": "Your response to the user",
  "operations": [
    {
      "type": "create_card" | "update_card" | "move_card" | "delete_card" | "rename_column",
      "cardId": "card id (for update/move/delete)",
      "columnId": "column id (for create/rename)",
      "title": "title (for create/update/rename)",
      "details": "details (for create/update)",
      "targetColumnId": "target column (for move)",
      "targetIndex": 0 (position for move)
    }
  ]
}

Only include operations when the user explicitly asks to modify the board. Otherwise return an empty operations array."""


async def call_ai(board_data: dict, user_message: str, history: list[dict]) -> dict:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    for msg in history:
        role = msg.get("role", "user")
        if role not in ("user", "assistant", "system"):
            role = "user"
        messages.append({"role": role, "content": msg.get("content", "")})

    board_json = json.dumps(board_data, indent=2)
    messages.append({
        "role": "user",
        "content": f"Current board state:\n{board_json}\n\nUser message: {user_message}",
    })

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Kanban PM",
            },
            json={
                "model": MODEL,
                "messages": messages,
                "response_format": {"type": "json_object"},
            },
        )
        response.raise_for_status()
        result = response.json()

    try:
        content = result["choices"][0]["message"]["content"]
        return json.loads(content)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as e:
        raise RuntimeError(f"Invalid AI response: {e}")
