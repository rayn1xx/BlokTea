import json
from collections.abc import Callable, Iterator

import httpx
import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.integrations import llm
from app.seed import U_ANALYST, U_MALKINA, U_SMIRNOV
from app.services import ai
from mocks.main import simple_pdf
from tests.api.conftest import auth
from tests.api.test_applications import REVIEW_APP, recommendation
from tests.fake_llm import Answer, FakeOllama

API = "/api/v1"


def i4(data: dict) -> dict:
    return {
        "reasons": [{"code": f["code"], "text": f"ИИ: {f['code']}"} for f in data["facts"]],
        "warning_text": "ИИ: платёж на эту сумму выше порога нагрузки" if data["requested"] else None,
    }


def i5(data: dict) -> dict:
    return {"explanation_text": f"ИИ: решение {data['decision_type']}", "improve_tips": ["ИИ: совет"]}


def i6(data: dict) -> dict:
    tips = [
        {"code": i["code"], "how_to_improve": "ИИ: совет"} for i in data["items"] if i["status"] in ("warning", "fail")
    ]
    return {"tips": tips, "summary_text": "ИИ: итог"}


def i7(_: dict) -> dict:
    return {"text": "ИИ: резюме", "risks": ["ИИ: риск"], "to_check": ["ИИ: проверить"]}


def i1(_: dict) -> dict:
    return {
        "detected_type": "fin_statements_2025",
        "confidence": 0.9,
        "fields": [
            {"key": "inn", "value": "7700000099", "confidence": 0.95},
            {"key": "revenue", "value": "120000000", "confidence": 0.8},
            {"key": "unknown_field", "value": "x", "confidence": 0.9},
        ],
    }


def i3(data: dict) -> dict:
    return {"issues": [{"code": c["code"], "severity": "error", "text": f"ИИ: {c['code']}"} for c in data["checks"]]}


ANSWERS: dict[str, Answer] = {"I1": i1, "I3": i3, "I4": i4, "I5": i5, "I6": i6, "I7": i7}


@pytest.fixture
def use_llm(monkeypatch: pytest.MonkeyPatch) -> Iterator[Callable[..., FakeOllama]]:
    def start(**overrides: Answer) -> FakeOllama:
        fake = FakeOllama({**ANSWERS, **overrides})
        monkeypatch.setattr(settings, "llm_enabled", True)
        monkeypatch.setattr(llm.client, "transport", fake.transport)
        return fake

    llm.client.clear_cache()
    yield start
    llm.client.clear_cache()


class TestRecommendation:
    async def test_reasons_and_warning_from_model(self, client: AsyncClient, demo: None, use_llm) -> None:
        _, template = await recommendation(client)
        fake = use_llm()
        _, rec = await recommendation(client)

        assert rec["text_source"] == "llm"
        assert [r["text"] for r in rec["primary"]["reasons"]] == [f"ИИ: {r['code']}" for r in rec["primary"]["reasons"]]
        warning = next(w for w in rec["warnings"] if w["code"] == "LOAD_ABOVE_THRESHOLD")
        assert warning["text"] == "ИИ: платёж на эту сумму выше порога нагрузки"
        assert rec["primary"]["amount"] == template["primary"]["amount"]
        assert rec["primary"]["load"] == template["primary"]["load"]
        assert fake.tasks() == ["I4"]
        sent = fake.calls[0]["input"]
        assert sent["amount_rub"] * 100 == rec["primary"]["amount"]["value"]
        assert sent["requested"]["amount_rub"] == 2_000_000

    async def test_invented_number_falls_back_to_template(self, client: AsyncClient, demo: None, use_llm) -> None:
        use_llm(I4=lambda data: {**i4(data), "warning_text": "Ставка будет 9%"})

        _, rec = await recommendation(client)

        assert rec["text_source"] == "template"
        assert rec["primary"]["reasons"][0]["text"].startswith("Цель:")


class TestReadiness:
    async def test_tips_and_summary_from_model(self, client: AsyncClient, demo: None, use_llm) -> None:
        use_llm()

        body = (await client.get(f"{API}/company/readiness", headers=auth(U_SMIRNOV))).json()

        assert body["text_source"] == "llm"
        assert body["summary_text"] == "ИИ: итог"
        assert all(i["how_to_improve"] == "ИИ: совет" for i in body["items"] if i["status"] in ("warning", "fail"))
        assert body["disclaimer"] == "Это ориентир, а не решение банка"

    async def test_invalid_json_falls_back(self, client: AsyncClient, demo: None, use_llm) -> None:
        use_llm(I6=lambda _: "{broken")

        body = (await client.get(f"{API}/company/readiness", headers=auth(U_SMIRNOV))).json()

        assert body["text_source"] == "template"


class TestBank:
    async def test_analyst_summary_without_personal_data(self, client: AsyncClient, demo: None, use_llm) -> None:
        fake = use_llm()

        detail = (await client.post(f"{API}/bank/applications/{REVIEW_APP}/ai-summary", headers=auth(U_ANALYST))).json()
        summary = detail["ai_summary"]

        assert (summary["text"], summary["risks"], summary["to_check"]) == (
            "ИИ: резюме",
            ["ИИ: риск"],
            ["ИИ: проверить"],
        )
        assert summary["text_source"] == "llm"
        sent = json.dumps(fake.calls[0]["input"], ensure_ascii=False)
        assert "Машпромхоз" not in sent and "Смирнов" not in sent
        assert fake.calls[0]["input"]["score"] == detail["scoring"]["total"]

    async def test_decision_preview_from_model(self, client: AsyncClient, demo: None, use_llm) -> None:
        use_llm()

        view = (
            await client.post(
                f"{API}/bank/applications/{REVIEW_APP}/decision/preview",
                headers=auth(U_ANALYST),
                json={"type": "approve"},
            )
        ).json()["client_view"]

        assert (view["type"], view["explanation_text"], view["text_source"]) == (
            "approved",
            "ИИ: решение approved",
            "llm",
        )
        assert view["improve_tips"] == []

    @pytest.mark.parametrize("text", ["Вам отказано", "Запрос отклонён"])
    async def test_refusal_words_rejected(self, client: AsyncClient, demo: None, use_llm, text: str) -> None:
        use_llm(I5=lambda _: {"explanation_text": text, "improve_tips": []})

        view = (
            await client.post(
                f"{API}/bank/applications/{REVIEW_APP}/decision/preview",
                headers=auth(U_ANALYST),
                json={"type": "reject", "reason_codes": ["high_load"]},
            )
        ).json()["client_view"]

        assert view["text_source"] == "template"
        assert view["explanation_text"].startswith("Сейчас не можем выдать кредит")


class TestDocuments:
    async def test_upload_analyzed_in_background(self, client: AsyncClient, demo: None, use_llm) -> None:
        fake = use_llm()
        pdf = simple_pdf(["Financial statements 2025", "INN 7700000099", "Revenue 120000000"])

        created = await client.post(
            f"{API}/documents",
            headers=auth(U_MALKINA),
            files={"file": ("report.pdf", pdf, "application/pdf")},
            data={"scope": "company"},
        )
        assert created.status_code == 201
        assert created.json()["status"] == "analyzing"
        assert created.json()["analysis"]["status"] == "pending"

        doc = (await client.get(f"{API}/documents/{created.json()['id']}", headers=auth(U_MALKINA))).json()
        analysis = doc["analysis"]

        assert "INN 7700000099" in fake.calls[0]["input"]["text"]
        assert fake.tasks() == ["I1", "I3"]
        assert doc["status"] == "uploaded"
        assert doc["document_type"] == "fin_statements_2025"
        assert (analysis["status"], analysis["detected_type"], analysis["model"]) == (
            "done",
            "fin_statements_2025",
            settings.llm_model_text,
        )
        assert [f["key"] for f in analysis["extracted_fields"]] == ["inn", "revenue"]
        assert analysis["checks"] == [{"code": "inn_match", "passed": False, "text": "ИИ: inn_match"}]
        assert analysis["issues"] == [{"severity": "error", "text": "ИИ: inn_match"}]
        assert analysis["text_source"] == "llm"

    async def test_unreadable_document_needs_manual_check(
        self, client: AsyncClient, demo: None, use_llm, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        fake = use_llm()
        monkeypatch.setattr(settings, "llm_model_vision", None)
        monkeypatch.setattr(ai, "ocr_text", lambda _: "")

        created = await client.post(
            f"{API}/documents",
            headers=auth(U_MALKINA),
            files={"file": ("scan.png", b"\x89PNG\r\n\x1a\n" + b"0" * 64, "image/png")},
            data={"scope": "company", "document_type": "charter"},
        )
        doc = (await client.get(f"{API}/documents/{created.json()['id']}", headers=auth(U_MALKINA))).json()

        assert fake.calls == []
        assert doc["analysis"]["status"] == "failed"
        assert doc["analysis"]["text_source"] == "template"

    async def test_passport_never_sent_to_model(self, client: AsyncClient, demo: None, use_llm) -> None:
        fake = use_llm()

        created = await client.post(
            f"{API}/documents",
            headers=auth(U_MALKINA),
            files={"file": ("p.pdf", simple_pdf(["Passport"]), "application/pdf")},
            data={"scope": "company", "document_type": "passport"},
        )

        assert created.json()["analysis"]["status"] == "unavailable"
        assert fake.calls == []


class TestHealth:
    @pytest.mark.parametrize(("models", "state"), [(["qwen3.5:9b"], "up"), ([], "down")])
    async def test_up_only_with_text_model(
        self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch, models: list[str], state: str
    ) -> None:
        monkeypatch.setattr(settings, "llm_enabled", True)
        monkeypatch.setattr(settings, "llm_model_text", "qwen3.5:9b")
        tags = {"models": [{"name": m} for m in models]}
        monkeypatch.setattr(llm.client, "transport", httpx.MockTransport(lambda _: httpx.Response(200, json=tags)))

        body = (await client.get(f"{API}/health")).json()

        assert body["llm"] == state
        assert body["llm_models"]["text"] == "qwen3.5:9b"
