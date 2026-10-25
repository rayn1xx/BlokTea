from httpx import AsyncClient

from app.seed import U_ADMIN, U_ANALYST, U_MALKINA, U_SMIRNOV, uid
from tests.api.conftest import auth

API = "/api/v1"
PDF = b"%PDF-1.4\n%demo\n"
REVIEW_APP = uid(1002)
ORLOVA_APP = uid(1007)


class TestDocuments:
    async def test_company_documents_with_statuses(self, client: AsyncClient, demo: None) -> None:
        docs = (await client.get(f"{API}/documents", headers=auth(U_SMIRNOV))).json()
        status = {d["document_type"]: d["status"] for d in docs}

        assert status == {"charter": "accepted", "director_decision": "expiring", "other_bank_statements": "rejected"}

    async def test_upload_checks_signature_not_extension(self, client: AsyncClient, demo: None) -> None:
        fake = await client.post(
            f"{API}/documents",
            headers=auth(U_MALKINA),
            files={"file": ("report.pdf", b"MZ\x90\x00\x03", "application/pdf")},
            data={"scope": "company", "document_type": "fin_statements_2025"},
        )
        good = await client.post(
            f"{API}/documents",
            headers=auth(U_MALKINA),
            files={"file": ("../../etc/passwd.pdf", PDF, "application/pdf")},
            data={"scope": "company", "document_type": "fin_statements_2025"},
        )

        assert fake.status_code == 422
        assert good.status_code == 201
        assert good.json()["file_name"] == "passwd.pdf"
        assert good.json()["analysis"]["status"] == "unavailable"
        assert good.json()["analysis"]["text_source"] == "template"
        file = await client.get(f"{API}/documents/{good.json()['id']}/file", headers=auth(U_MALKINA))
        assert file.content == PDF

    async def test_statements_upload_clears_stale_and_missing(self, client: AsyncClient, demo: None) -> None:
        before = (await client.get(f"{API}/documents/missing", headers=auth(U_SMIRNOV))).json()["items"]
        await client.post(
            f"{API}/documents",
            headers=auth(U_MALKINA),
            files={"file": ("o.pdf", PDF, "application/pdf")},
            data={"scope": "company", "document_type": "fin_statements_2025"},
        )
        after = (await client.get(f"{API}/documents/missing", headers=auth(U_SMIRNOV))).json()["items"]
        stale = (await client.get(f"{API}/company/finance-summary", headers=auth(U_SMIRNOV))).json()["stale"]

        assert [i["document_type"] for i in before] == ["fin_statements_2025"]
        assert after == []
        assert stale == {"reason": None, "text": None}

    async def test_from_lk_and_versions(self, client: AsyncClient, demo: None) -> None:
        doc = (
            await client.post(
                f"{API}/documents/from-lk",
                headers=auth(U_MALKINA),
                json={
                    "kind": "bank_statement",
                    "period_from": "2026-04-01",
                    "period_to": "2026-09-30",
                },
            )
        ).json()
        assert (doc["origin"], doc["status"], doc["document_type"]) == ("alfa_lk", "accepted", "bank_statement")
        content = await client.get(f"{API}/documents/{doc['id']}/file", headers=auth(U_MALKINA))
        assert content.content.startswith(b"%PDF")

        version = await client.post(
            f"{API}/documents/{doc['id']}/versions",
            headers=auth(U_MALKINA),
            files={"file": ("new.pdf", PDF, "application/pdf")},
        )
        assert (version.json()["version"], version.json()["origin"]) == (2, "upload")

    async def test_delete(self, client: AsyncClient, demo: None) -> None:
        doc = (
            await client.post(
                f"{API}/documents",
                headers=auth(U_MALKINA),
                files={"file": ("a.txt", b"hello", "text/plain")},
                data={"scope": "company", "document_type": "other"},
            )
        ).json()

        assert (await client.delete(f"{API}/documents/{doc['id']}", headers=auth(U_MALKINA))).status_code == 204
        assert (await client.get(f"{API}/documents/{doc['id']}", headers=auth(U_MALKINA))).status_code == 404

    async def test_signing_document_is_generated(self, client: AsyncClient, demo: None) -> None:
        response = await client.get(f"{API}/documents/sign-{uid(1003)}-contract/file", headers=auth(U_SMIRNOV))

        assert response.status_code == 200
        assert "КРЕДИТНЫЙ ДОГОВОР № КЗ-2026-001040" in response.text


class TestBank:
    async def test_client_has_no_access(self, client: AsyncClient, demo: None) -> None:
        assert (await client.get(f"{API}/bank/applications", headers=auth(U_SMIRNOV))).status_code == 403

    async def test_queue(self, client: AsyncClient, demo: None) -> None:
        body = (await client.get(f"{API}/bank/applications", headers=auth(U_ANALYST))).json()
        items = {i["number"]: i for i in body["items"]}

        assert set(items) == {"КЗ-2026-001039", "КЗ-2026-001041"}
        assert items["КЗ-2026-001039"]["company"]["inn"] == "7700000001"
        assert items["КЗ-2026-001039"]["available_actions"] == ["bank.take", "bank.decide", "bank.request_info"]
        assert items["КЗ-2026-001041"]["score"] is not None

    async def test_detail_and_ai_summary(self, client: AsyncClient, demo: None) -> None:
        detail = (await client.get(f"{API}/bank/applications/{REVIEW_APP}", headers=auth(U_ANALYST))).json()

        assert {c["source"] for c in detail["checks"]} == {
            "registry",
            "credit_bureau",
            "turnover",
            "fns_transparent",
            "load",
        }
        assert all(c["is_mock"] for c in detail["checks"])
        assert detail["finance"]["free_cash_flow"]["value"]["value"] == 65_000_000
        assert detail["ai_summary"] is None

        summary = (
            await client.post(f"{API}/bank/applications/{REVIEW_APP}/ai-summary", headers=auth(U_ANALYST))
        ).json()
        assert "ООО «Машпромхоз»" in summary["ai_summary"]["text"]
        assert summary["audit"][-1]["action"] == "Обновил ИИ-резюме"

    async def test_counter_offer_options(self, client: AsyncClient, demo: None) -> None:
        options = (
            await client.get(f"{API}/bank/applications/{REVIEW_APP}/counter-offer-options", headers=auth(U_ANALYST))
        ).json()["options"]

        assert 0 < len(options) <= 3
        assert all(o["load"]["load_percent"] <= 26.5 and o["score"] >= 70 for o in options)

    async def test_preview_does_not_change_application(self, client: AsyncClient, demo: None) -> None:
        preview = (
            await client.post(
                f"{API}/bank/applications/{REVIEW_APP}/decision/preview",
                headers=auth(U_ANALYST),
                json={"type": "approve"},
            )
        ).json()
        detail = (await client.get(f"{API}/bank/applications/{REVIEW_APP}", headers=auth(U_ANALYST))).json()

        assert preview["client_view"]["type"] == "approved"
        assert detail["status"] == "in_review"

    async def test_decision_validation(self, client: AsyncClient, demo: None) -> None:
        response = await client.post(
            f"{API}/bank/applications/{REVIEW_APP}/decision", headers=auth(U_ANALYST), json={"type": "counter_offer"}
        )

        assert response.status_code == 422
        assert set(response.json()["error"]["details"]) == {"amount", "term_months", "rate_percent", "reason_code"}

    async def test_approve(self, client: AsyncClient, demo: None) -> None:
        body = (
            await client.post(
                f"{API}/bank/applications/{ORLOVA_APP}/decision",
                headers=auth(U_ANALYST),
                json={"type": "approve", "comment": "ок"},
            )
        ).json()

        assert body["status"] == "approved"
        assert body["decision"]["decided_by"] == "underwriter"
        assert body["approved_amount"] == {"value": 90_000_000, "currency": "RUB"}

    async def test_call_note(self, client: AsyncClient, demo: None) -> None:
        response = await client.post(
            f"{API}/bank/applications/{REVIEW_APP}/calls",
            headers=auth(U_ANALYST),
            json={
                "topic": "Уточнили обороты",
                "summary": "Клиент подтвердил сезонный спад летом",
                "agreements": ["Пришлёт выписку за июль", " "],
                "next_step": "Загрузить выписку",
                "next_step_due": "2026-11-01",
                "duration_minutes": 15,
            },
        )

        assert response.status_code == 201
        call = response.json()["calls"][0]
        assert call["topic"] == "Уточнили обороты"
        assert call["stage"] == "in_review"
        assert call["agreements"] == ["Пришлёт выписку за июль"]
        assert call["next_step_due"] == "2026-11-01"
        assert response.json()["timeline"][-1]["title"] == "Звонок с банком"

    async def test_call_note_validation(self, client: AsyncClient, demo: None) -> None:
        response = await client.post(
            f"{API}/bank/applications/{REVIEW_APP}/calls", headers=auth(U_ANALYST), json={"topic": " ", "summary": ""}
        )

        assert response.status_code == 422
        assert set(response.json()["error"]["details"]) == {"topic", "summary"}

    async def test_settings_only_admin_edits(self, client: AsyncClient, demo: None) -> None:
        current = (await client.get(f"{API}/bank/settings/scoring", headers=auth(U_ANALYST))).json()
        changed = {**current, "approve_min": 75}

        assert (
            await client.put(f"{API}/bank/settings/scoring", headers=auth(U_ANALYST), json=changed)
        ).status_code == 403
        assert (await client.put(f"{API}/bank/settings/scoring", headers=auth(U_ADMIN), json=changed)).json()[
            "approve_min"
        ] == 75
        bad = await client.put(
            f"{API}/bank/settings/scoring", headers=auth(U_ADMIN), json={**current, "manual_review_min": 90}
        )
        assert bad.status_code == 422
        assert bad.json()["error"]["details"]["manual_review_min"].startswith("Не выше порога других условий")

    async def test_dashboard(self, client: AsyncClient, demo: None) -> None:
        body = (await client.get(f"{API}/bank/dashboard", headers=auth(U_ADMIN))).json()

        assert body["period"] == "7d"
        assert set(body["by_status"]) == {
            "draft",
            "submitted",
            "in_review",
            "info_requested",
            "approved",
            "counter_offer",
            "rejected",
            "signing",
            "issued",
            "cancelled",
        }

    async def test_templates_and_reasons(self, client: AsyncClient, demo: None) -> None:
        templates = (await client.get(f"{API}/bank/info-request-templates", headers=auth(U_ANALYST))).json()
        reasons = (await client.get(f"{API}/bank/rejection-reasons", headers=auth(U_ANALYST))).json()

        assert templates[0]["requested_document_types"] == ["fin_statements_2025"]
        assert {"code": "high_load", "title": "Высокая долговая нагрузка"} in reasons
