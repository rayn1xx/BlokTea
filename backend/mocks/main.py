"""Сервис моков внешних систем (раздел 4 ТЗ): Альфа-Бизнес, ЕГРЮЛ/ЕГРИП, реестр МСП, БКИ, ФНС.

Все ответы синтетические и отдаются по ИНН из seed; неизвестный ИНН даёт 404. Каждый ответ с заголовком X-Mock: true.
MOCKS_DOWN=bki,fns выключает системы (503), чтобы показать сценарий «источник недоступен».

Запуск: uvicorn mocks.main:app --port 8100
"""

import os
from datetime import date, timedelta

from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel

from mocks import data

app = FastAPI(title="BlokTea mocks", description="Смоделированные внешние системы. Данные синтетические.")

SYSTEMS = ("alfa_lk", "registry", "msp", "bki", "fns")


def down_systems() -> set[str]:
    return {s.strip() for s in os.environ.get("MOCKS_DOWN", "").split(",") if s.strip()}


@app.middleware("http")
async def mock_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Mock"] = "true"
    return response


def company(inn: str, system: str) -> dict:
    if system in down_systems():
        raise HTTPException(503, f"{system} is down")
    if inn not in data.COMPANIES:
        raise HTTPException(404, "unknown inn")
    return data.COMPANIES[inn]


@app.get("/health")
def health() -> dict:
    down = down_systems()
    return {"status": "ok", "systems": {s: "down" if s in down else "ok" for s in SYSTEMS}}


@app.get("/alfa/users/{login}")
def alfa_user(login: str) -> dict:
    if "alfa_lk" in down_systems():
        raise HTTPException(503, "alfa_lk is down")
    user = data.USERS.get(login.lower())
    if not user:
        raise HTTPException(404, "unknown user")
    return user


@app.get("/alfa/companies/{inn}/employees")
def employees(inn: str) -> dict:
    return {"items": company(inn, "alfa_lk")["employees"]}


@app.get("/alfa/companies/{inn}/accounts")
def accounts(inn: str) -> dict:
    return {"items": company(inn, "alfa_lk")["accounts"]}


def last_full_months(today: date) -> tuple[date, date]:
    end = today.replace(day=1) - timedelta(days=1)
    start = date(end.year - 1, end.month, 1) + timedelta(days=32)
    return start.replace(day=1), end


@app.get("/alfa/companies/{inn}/transactions")
def transactions(inn: str, request: Request) -> dict:
    company(inn, "alfa_lk")
    default_from, default_to = last_full_months(date.today())
    start = date.fromisoformat(request.query_params.get("from") or default_from.isoformat())
    end = date.fromisoformat(request.query_params.get("to") or default_to.isoformat())
    return {"items": data.transactions(inn, start, end), "from": start.isoformat(), "to": end.isoformat()}


@app.get("/alfa/companies/{inn}/loans")
def loans(inn: str) -> dict:
    return {"items": company(inn, "alfa_lk")["loans"]}


@app.get("/alfa/companies/{inn}/payroll")
def payroll(inn: str) -> dict:
    return company(inn, "alfa_lk")["payroll"]


@app.get("/alfa/companies/{inn}/accounting")
def accounting(inn: str) -> dict:
    return company(inn, "alfa_lk")["accounting"]


@app.get("/alfa/companies/{inn}/invoices")
def invoices(inn: str, status: str | None = None) -> dict:
    items = company(inn, "alfa_lk")["invoices"]
    return {"items": [i for i in items if not status or i["status"] == status]}


@app.get("/alfa/companies/{inn}/preapproved-offers")
def preapproved(inn: str) -> dict:
    return {"items": company(inn, "alfa_lk")["preapproved"]}


@app.get("/alfa/companies/{inn}/multibank")
def multibank(inn: str) -> dict:
    return company(inn, "alfa_lk")["multibank"]


class StatementRequest(BaseModel):
    kind: str
    period_from: str
    period_to: str


def simple_pdf(lines: list[str]) -> bytes:
    """Минимальный валидный PDF с текстом (латиница: стандартный шрифт без кириллицы)."""
    text = "\n".join(f"({line}) Tj 0 -18 Td" for line in lines)
    stream = f"BT /F1 12 Tf 50 780 Td {text} ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


@app.post("/alfa/companies/{inn}/statements")
def statements(inn: str, body: StatementRequest) -> Response:
    c = company(inn, "alfa_lk")
    lines = [
        "Alfa-Business (simulated)",
        f"Document: {body.kind}",
        f"INN: {inn}",
        f"OGRN: {c['registry']['ogrn']}",
        f"Period: {body.period_from} - {body.period_to}",
        "Synthetic data for the prototype",
    ]
    return Response(simple_pdf(lines), media_type="application/pdf")


@app.get("/registry/{inn}")
def registry(inn: str) -> dict:
    return company(inn, "registry")["registry"]


@app.get("/msp/{inn}")
def msp(inn: str) -> dict:
    return company(inn, "msp")["msp"]


@app.get("/bki/{inn}")
def bki(inn: str) -> dict:
    return company(inn, "bki")["bki"]


@app.get("/fns/{inn}")
def fns(inn: str) -> dict:
    return company(inn, "fns")["fns"]
