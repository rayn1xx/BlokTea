"""Клиент к сервису моков внешних систем. Все системы смоделированы (THIRD_PARTY_NOTICES)."""

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import date
from typing import Any

import httpx

from app.core.config import settings


class IntegrationUnavailable(Exception):
    """Внешняя система не ответила или ответила ошибкой."""

    def __init__(self, system: str) -> None:
        super().__init__(system)
        self.system = system


class ExternalSystems:
    """Обращения к мокам в рамках одного запроса; одинаковые вызовы кешируются в памяти."""

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client
        self._cache: dict[tuple, Any] = {}

    async def _request(self, system: str, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            response = await self._client.request(method, path, **kwargs)
        except httpx.HTTPError as e:
            raise IntegrationUnavailable(system) from e
        if response.status_code != 200:
            raise IntegrationUnavailable(system)
        return response

    async def _get(self, system: str, path: str, params: dict | None = None) -> Any:
        key = (path, tuple(sorted((params or {}).items())))
        if key not in self._cache:
            self._cache[key] = (await self._request(system, "GET", path, params=params)).json()
        return self._cache[key]

    async def health(self) -> dict:
        try:
            return (await self._request("mocks", "GET", "/health")).json()
        except IntegrationUnavailable:
            return {"status": "down", "systems": {}}

    async def registry(self, inn: str) -> dict:
        return await self._get("registry", f"/registry/{inn}")

    async def msp(self, inn: str) -> dict:
        return await self._get("msp", f"/msp/{inn}")

    async def bki(self, inn: str) -> dict:
        return await self._get("bki", f"/bki/{inn}")

    async def fns(self, inn: str) -> dict:
        return await self._get("fns", f"/fns/{inn}")

    async def transactions(self, inn: str, start: date, end: date) -> list[dict]:
        params = {"from": start.isoformat(), "to": end.isoformat()}
        return (await self._get("alfa_lk", f"/alfa/companies/{inn}/transactions", params))["items"]

    async def loans(self, inn: str) -> list[dict]:
        return (await self._get("alfa_lk", f"/alfa/companies/{inn}/loans"))["items"]

    async def accounts(self, inn: str) -> list[dict]:
        return (await self._get("alfa_lk", f"/alfa/companies/{inn}/accounts"))["items"]

    async def employees(self, inn: str) -> list[dict]:
        return (await self._get("alfa_lk", f"/alfa/companies/{inn}/employees"))["items"]

    async def payroll(self, inn: str) -> dict:
        return await self._get("alfa_lk", f"/alfa/companies/{inn}/payroll")

    async def accounting(self, inn: str) -> dict:
        return await self._get("alfa_lk", f"/alfa/companies/{inn}/accounting")

    async def invoices(self, inn: str) -> list[dict]:
        return (await self._get("alfa_lk", f"/alfa/companies/{inn}/invoices", {"status": "issued"}))["items"]

    async def preapproved(self, inn: str) -> list[dict]:
        return (await self._get("alfa_lk", f"/alfa/companies/{inn}/preapproved-offers"))["items"]

    async def multibank(self, inn: str) -> dict:
        return await self._get("alfa_lk", f"/alfa/companies/{inn}/multibank")

    async def statement(self, inn: str, kind: str, period_from: str, period_to: str) -> bytes:
        body = {"kind": kind, "period_from": period_from, "period_to": period_to}
        return (await self._request("alfa_lk", "POST", f"/alfa/companies/{inn}/statements", json=body)).content


async def optional(call) -> Any:
    """Результат вызова или None, если система недоступна."""
    try:
        return await call
    except IntegrationUnavailable:
        return None


ExternalFactory = Callable[[], Any]


@asynccontextmanager
async def open_external(transport: httpx.AsyncBaseTransport | None = None) -> AsyncIterator[ExternalSystems]:
    async with httpx.AsyncClient(
        base_url=settings.mocks_base_url,
        timeout=settings.mocks_timeout_seconds,
        transport=transport,
        # внутренний сервис: системный прокси не нужен
        trust_env=False,
    ) as client:
        yield ExternalSystems(client)
