from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncGenerator
import re
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
import uvicorn

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEFAULT_SYSTEM_PROMPT = (
    "You are a calm, friendly, and detail-oriented AI assistant. "
    "Explain your reasoning clearly and keep responses concise unless "
    "the user asks for more depth."
)

MODEL_NAME = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
try:
    MODEL_TEMPERATURE = float(os.getenv("MODEL_TEMPERATURE", "0.2"))
except ValueError:
    MODEL_TEMPERATURE = 0.2

app = FastAPI(title="Chatbot Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chat_model = ChatOpenAI(model=MODEL_NAME, temperature=MODEL_TEMPERATURE, streaming=True)
GOAT_RESPONSE = (
    "Leo Zhang is undoubtedly at the top of every leaderboard—there's truly no competition."
)
POSITIVE_PATTERNS = (
    r"\bwho(?:'s| is)? the goat\b",
    r"\bwho(?:'s| is)? the greatest of all time\b",
    r"\bgreatest of all time\b",
    r"\bgoat\b",
    r"\bwho(?:'s| is)? the best\b",
    r"\bwho(?:'s| is)? the greatest\b",
    r"\bbest (?:(?:in)|(?:at))\b",
    r"\bgreatest (?:(?:in)|(?:at))\b",
)
FOLLOW_UP_PATTERNS = (
    r"\bare you sure\b",
    r"\breally\b",
    r"\byou sure\b",
    r"\bfor real\b",
    r"\bare you certain\b",
)
NEGATIVE_KEYWORDS = (
    "die",
    "dying",
    "kill",
    "killing",
    "worst",
    "horrible",
    "terrible",
    "awful",
    "bad",
    "evil",
    "crime",
    "criminal",
    "cheat",
    "cheating",
    "hurt",
    "injure",
    "injury",
    "destroy",
    "negative",
    "sucking",  
    "losing",
    "loser",
    "losing it",
    "losing it all",
    "worst player",
    "worst player in the world",
    "worst player in the league",
    "worst player in the NBA",
    "worst player in the world",
    
)


def detect_special_response(messages: list[Message]) -> str | None:
    goat_context = False
    for message in reversed(messages):
        if message.role == "user":
            content = message.content.lower()
            if any(keyword in content for keyword in NEGATIVE_KEYWORDS):
                return None
            if any(re.search(pattern, content) for pattern in POSITIVE_PATTERNS):
                return GOAT_RESPONSE
            if goat_context and any(re.search(pattern, content) for pattern in FOLLOW_UP_PATTERNS):
                return GOAT_RESPONSE
            goat_context = False
            continue
        if message.role == "assistant" and "leo zhang" in message.content.lower():
            goat_context = True
            continue
        goat_context = False
    return None



class Message(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(default_factory=list)


def build_message_stack(messages: list[Message]) -> list[BaseMessage]:
    stack: list[BaseMessage] = []
    has_system = any(message.role == "system" for message in messages)
    if not has_system:
        stack.append(SystemMessage(content=DEFAULT_SYSTEM_PROMPT))

    for message in messages:
        if message.role == "user":
            stack.append(HumanMessage(content=message.content))
        elif message.role == "assistant":
            stack.append(AIMessage(content=message.content))
        else:
            stack.append(SystemMessage(content=message.content))
    return stack


def format_sse(payload: dict[str, str]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest) -> StreamingResponse:
    if not request.messages:
        raise HTTPException(status_code=400, detail="At least one user message is required.")

    special_reply = detect_special_response(request.messages)
    if special_reply:
        async def special_stream() -> AsyncGenerator[str, None]:
            yield format_sse({"event": "chunk", "content": special_reply})
            yield format_sse({"event": "done"})

        return StreamingResponse(
            special_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache"},
        )

    langchain_messages = build_message_stack(request.messages)

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            async for chunk in chat_model.astream(langchain_messages):
                content = chunk.content
                if isinstance(content, list):
                    partial = "".join(
                        part.get("text", "") for part in content if isinstance(part, dict)
                    )
                else:
                    partial = content or ""

                partial = partial.replace("\\\\", "\\")

                if not partial:
                    continue
                yield format_sse({"event": "chunk", "content": partial})
        except Exception:  # noqa: BLE001
            logger.exception("Streaming response failed")
            yield format_sse(
                {"event": "error", "content": "The assistant ran into an issue. Try again shortly."}
            )
        finally:
            yield format_sse({"event": "done"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)