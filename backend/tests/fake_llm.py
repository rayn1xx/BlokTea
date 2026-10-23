"""Фейковый Ollama для тестов: отвечает на /api/chat по номеру задачи из запроса."""

import json
from collections.abc import Callable

import httpx

Answer = Callable[[dict], dict | str]


class FakeOllama:
    """answers: задача (I1-I8) -> функция от input, возвращает объект ответа или сырую строку."""

    def __init__(self, answers: dict[str, Answer]) -> None:
        self.answers = answers
        self.calls: list[dict] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        user = json.loads(body["messages"][-1]["content"])
        self.calls.append({"task": user["task"], "model": body["model"], "input": user["input"], "body": body})
        answer = self.answers[user["task"]](user["input"])
        content = answer if isinstance(answer, str) else json.dumps(answer, ensure_ascii=False)
        return httpx.Response(200, json={"model": body["model"], "message": {"role": "assistant", "content": content}})

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)

    def tasks(self) -> list[str]:
        return [c["task"] for c in self.calls]
