import hashlib
import json
import logging
import re
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Literal

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import settings

log = logging.getLogger(__name__)

Task = Literal["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8"]
FailReason = Literal["disabled", "timeout", "invalid_json", "schema_mismatch", "numbers_mismatch", "error"]

SYSTEM_PROMPT = (
    "Ты помогаешь клиентам банка понять кредитные условия. Пиши по-русски, просто, без банковского жаргона, на «вы».\n"
    "Используй только факты из входных данных. Не придумывай цифры, ставки, сроки и обещания одобрения.\n"
    "Не используй слово «отказано» и обвинительный тон. Не используй длинное тире.\n"
    "Ответь строго JSON по схеме."
)
ANALYST_PROMPT = "Ты пишешь для кредитного аналитика. Перечисли риски и что проверить. Решение принимает аналитик."
EXTRACT_PROMPT = (
    "Ты извлекаешь данные из документов для банка. Используй только то, что написано в документе.\n"
    "Тип документа выбирай только из allowed_types, иначе null. Поле без уверенности не возвращай.\n"
    "Даты в формате ГГГГ-ММ-ДД, суммы цифрами в рублях без пробелов.\n"
    "Ответь строго JSON по схеме."
)

CACHE_SIZE = 512
MAX_ATTEMPTS = 2


@dataclass(frozen=True)
class LlmResult:
    ok: bool
    output: Any = None
    model: str | None = None
    ms: int = 0
    reason: FailReason | None = None


NUMBER_RE = re.compile(r"(?<![\w.,])(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?(?:\s*(млн|млрд|тыс))?", re.IGNORECASE)
SCALE = {"тыс": 1_000, "млн": 1_000_000, "млрд": 1_000_000_000}


def numbers_in_text(text: str) -> list[float]:
    result = []
    for whole, frac, scale in NUMBER_RE.findall(text):
        value = float(re.sub(r"\D", "", whole) + (f".{frac}" if frac else ""))
        result.append(value * SCALE.get(scale.lower(), 1) if scale else value)
    return result


def numbers_in_input(data: Any) -> set[float]:
    found: set[float] = set()
    if isinstance(data, bool) or data is None:
        return found
    if isinstance(data, int | float):
        found.add(float(data))
    elif isinstance(data, str):
        found.update(numbers_in_text(data))
    elif isinstance(data, dict):
        for value in data.values():
            found |= numbers_in_input(value)
    elif isinstance(data, list | tuple):
        for value in data:
            found |= numbers_in_input(value)
    return found


def number_known(value: float, known: set[float]) -> bool:
    for k in known:
        if abs(k) >= 10_000:
            if abs(value - k) <= abs(k) * 0.01:
                return True
        elif abs(value - k) <= 0.05 or (value.is_integer() and round(k) == value):
            return True
    return False


def unknown_numbers(texts: list[str], data: Any) -> list[float]:
    known = numbers_in_input(data)
    return [n for t in texts for n in numbers_in_text(t) if not number_known(n, known)]


GRAMMAR_UNSAFE = {"maxLength", "maxItems", "minItems"}


def generation_schema(data: Any) -> Any:
    if isinstance(data, dict):
        return {k: generation_schema(v) for k, v in data.items() if k not in GRAMMAR_UNSAFE}
    if isinstance(data, list):
        return [generation_schema(v) for v in data]
    return data


def strings_in(data: Any) -> list[str]:
    if isinstance(data, str):
        return [data]
    if isinstance(data, dict):
        return [s for v in data.values() for s in strings_in(v)]
    if isinstance(data, list):
        return [s for v in data for s in strings_in(v)]
    return []


class LlmClient:
    def __init__(self) -> None:
        self.transport: httpx.AsyncBaseTransport | None = None
        self._cache: OrderedDict[str, LlmResult] = OrderedDict()

    def clear_cache(self) -> None:
        self._cache.clear()

    async def complete(
        self,
        task: Task,
        input: dict,
        output: type[BaseModel],
        *,
        system: str = SYSTEM_PROMPT,
        model: str | None = None,
        images: list[str] | None = None,
        check_numbers: bool = False,
    ) -> LlmResult:
        if not settings.llm_enabled:
            return LlmResult(ok=False, reason="disabled")
        model = model or settings.llm_model_text
        key = hashlib.sha256(
            json.dumps(
                [task, model, input, images, settings.llm_temperature], ensure_ascii=False, sort_keys=True
            ).encode()
        ).hexdigest()
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]

        result = LlmResult(ok=False, reason="error")
        for _ in range(MAX_ATTEMPTS):
            result = await self._attempt(task, input, output, system, model, images, check_numbers)
            if result.ok:
                self._cache[key] = result
                if len(self._cache) > CACHE_SIZE:
                    self._cache.popitem(last=False)
                break
        if not result.ok:
            log.warning("llm %s fallback to template: %s", task, result.reason)
        return result

    async def _attempt(
        self,
        task: Task,
        input: dict,
        output: type[BaseModel],
        system: str,
        model: str,
        images: list[str] | None,
        check_numbers: bool,
    ) -> LlmResult:
        user: dict[str, Any] = {
            "role": "user",
            "content": json.dumps({"task": task, "input": input}, ensure_ascii=False),
        }
        if images:
            user["images"] = images
        body = {
            "model": model,
            "messages": [{"role": "system", "content": system}, user],
            "format": generation_schema(output.model_json_schema()),
            "stream": False,
            "think": False,
            "options": {"temperature": settings.llm_temperature},
        }
        started = time.monotonic()
        try:
            async with httpx.AsyncClient(
                base_url=settings.ollama_base_url,
                timeout=settings.llm_timeout_ms / 1000,
                transport=self.transport,
                trust_env=False,
            ) as client:
                response = await client.post("/api/chat", json=body)
        except httpx.TimeoutException:
            return LlmResult(ok=False, model=model, reason="timeout")
        except httpx.HTTPError:
            return LlmResult(ok=False, model=model, reason="error")
        ms = int((time.monotonic() - started) * 1000)
        if response.status_code != 200:
            log.warning("ollama %s: %s", response.status_code, response.text[:200])
            return LlmResult(ok=False, model=model, ms=ms, reason="error")
        try:
            content = response.json()["message"]["content"].replace("\u2014", "-").replace("\u2013", "-")
            raw = json.loads(content)
        except (ValueError, KeyError, TypeError):
            return LlmResult(ok=False, model=model, ms=ms, reason="invalid_json")
        try:
            parsed = output.model_validate(raw)
        except ValidationError:
            return LlmResult(ok=False, model=model, ms=ms, reason="schema_mismatch")
        if check_numbers and unknown_numbers(strings_in(parsed.model_dump()), input):
            return LlmResult(ok=False, model=model, ms=ms, reason="numbers_mismatch")
        return LlmResult(ok=True, output=parsed, model=model, ms=ms)


client = LlmClient()
