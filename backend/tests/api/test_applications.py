"""Заявки клиента: список, создание, черновик, согласия, отправка, решение, подписание (К.8-К.11, сценарии А-Д)."""

import uuid

import pytest
from httpx import AsyncClient

from app.seed import U_ANALYST, U_LES, U_MALKINA, U_NOROLE, U_ORLOVA, U_PETROV, U_SMIRNOV, uid
from tests.api.conftest import auth

API = "/api/v1"
SIGNING_APP = uid(1003)  # КЗ-2026-001040, ждёт подписи
DRAFT_APP = uid(1001)  # КЗ-2026-001037, черновик Лес И. О.
REVIEW_APP = uid(1002)  # КЗ-2026-001039, на рассмотрении

NEED = {
    "purpose": "working_capital",
    "amount": {"value": 200_000_000, "currency": "RUB"},
    "term_months": 24,
    "need_type": "one_time",
    "disbursement": "lump_sum",
    "urgency": "week",
}


async def recommendation(client: AsyncClient, need: dict | None = None) -> tuple[str, dict]:
    h = auth(U_SMIRNOV)
    session = (await client.post(f"{API}/matching-sessions", headers=h)).json()
    sid = session["id"]
    await client.patch(f"{API}/matching-sessions/{sid}", headers=h, json={"need": need or NEED, "step": 2})
    await client.patch(f"{API}/matching-sessions/{sid}", headers=h, json={"finance_confirmed": True, "step": 3})
    await client.patch(f"{API}/matching-sessions/{sid}", headers=h, json={"extra": {"skipped": True}})
    response = await client.post(f"{API}/matching-sessions/{sid}/recommend", headers=h)
    assert response.status_code == 200, response.text
    return sid, response.json()


async def create_from_recommendation(client: AsyncClient, keep_requested: bool) -> dict:
    sid, _ = await recommendation(client)
    response = await client.post(
        f"{API}/applications",
        headers=auth(U_SMIRNOV),
        json={"source": "recommendation", "matching_session_id": sid, "keep_requested": keep_requested},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def sign_consent(client: AsyncClient, app_id: str, user=U_SMIRNOV) -> None:
    h = auth(user)
    challenge = (await client.post(f"{API}/applications/{app_id}/consents/consent_bki/challenge", headers=h)).json()
    response = await client.post(
        f"{API}/applications/{app_id}/consents/consent_bki/confirm",
        headers=h,
        json={"challenge_id": challenge["challenge_id"], "code": challenge["demo_code"]},
    )
    assert response.status_code == 200, response.text


async def submit(client: AsyncClient, app_id: str) -> dict:
    await sign_consent(client, app_id)
    response = await client.post(f"{API}/applications/{app_id}/submit", headers=auth(U_SMIRNOV))
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "submitted"
    # автопроверки идут фоновой задачей; через ASGI-транспорт она завершается вместе с запросом
    return (await client.get(f"{API}/applications/{app_id}", headers=auth(U_SMIRNOV))).json()


async def sign(client: AsyncClient, app_id: str, user) -> dict:
    h = auth(user)
    challenge = (await client.post(f"{API}/applications/{app_id}/signing/challenge", headers=h)).json()
    response = await client.post(
        f"{API}/applications/{app_id}/signing/confirm",
        headers=h,
        json={"challenge_id": challenge["challenge_id"], "code": challenge["demo_code"]},
    )
    assert response.status_code == 200, response.text
    return response.json()


class TestList:
    async def test_requires_company_role(self, client: AsyncClient, demo: None) -> None:
        response = await client.get(f"{API}/applications", headers=auth(U_NOROLE))

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "NO_COMPANY_ROLE"

    async def test_counters_for_home_buttons(self, client: AsyncClient, demo: None) -> None:
        body = (await client.get(f"{API}/applications", headers=auth(U_SMIRNOV))).json()

        assert body["counters"] == {"drafts": 1, "in_bank": 1, "awaiting_signing": 1, "finished": 3}
        assert body["total"] == 6

    async def test_filter_sort_and_pages(self, client: AsyncClient, demo: None) -> None:
        h = auth(U_SMIRNOV)
        finished = (
            await client.get(
                f"{API}/applications",
                headers=h,
                params=[("status", "issued"), ("status", "rejected"), ("status", "cancelled")],
            )
        ).json()
        page = (
            await client.get(
                f"{API}/applications", headers=h, params={"sort": "-requested_amount", "page": 2, "page_size": 2}
            )
        ).json()

        assert {i["status"] for i in finished["items"]} == {"issued", "rejected", "cancelled"}
        assert [i["number"] for i in page["items"]] == ["КЗ-2026-001039", "КЗ-2026-001037"]

    async def test_bad_sort_is_400(self, client: AsyncClient, demo: None) -> None:
        response = await client.get(f"{API}/applications", headers=auth(U_SMIRNOV), params={"sort": "number"})

        assert response.status_code == 400
        assert response.json()["error"]["code"] == "BAD_REQUEST"

    async def test_awaiting_from_and_actions(self, client: AsyncClient, demo: None) -> None:
        items = (await client.get(f"{API}/applications", headers=auth(U_PETROV))).json()["items"]
        signing = next(i for i in items if i["number"] == "КЗ-2026-001040")

        assert signing["awaiting_from"]["name"] == "Смирнов П. И."
        # подпись Петрова вторая: пока его очередь не пришла, подписывать нельзя
        assert "signing.sign" not in signing["available_actions"]

    async def test_other_company_application_is_404(self, client: AsyncClient, demo: None) -> None:
        response = await client.get(f"{API}/applications/{SIGNING_APP}", headers=auth(U_ORLOVA))

        assert response.status_code == 404


class TestCreate:
    async def test_from_catalog_validates_limits(self, client: AsyncClient, demo: None) -> None:
        response = await client.post(
            f"{API}/applications",
            headers=auth(U_SMIRNOV),
            json={
                "source": "catalog",
                "product_code": "express",
                "amount": {"value": 500_000_000, "currency": "RUB"},
                "term_months": 12,
            },
        )

        assert response.status_code == 422
        assert "amount" in response.json()["error"]["details"]

    async def test_from_catalog(self, client: AsyncClient, demo: None) -> None:
        response = await client.post(
            f"{API}/applications",
            headers=auth(U_SMIRNOV),
            json={
                "source": "catalog",
                "product_code": "express",
                "amount": {"value": 50_000_000, "currency": "RUB"},
                "term_months": 12,
            },
        )
        body = response.json()

        assert response.status_code == 201
        assert body["number"].startswith("КЗ-2026-") and len(body["number"]) == 14
        assert (body["status"], body["rate_percent"], body["version"]) == ("draft", 19.0, 1)
        assert body["timeline"][0]["title"] == "Заявка создана"

    async def test_preapproved_offer_used_once(self, client: AsyncClient, demo: None) -> None:
        h = auth(U_SMIRNOV)
        offer = (await client.get(f"{API}/offers/preapproved", headers=h)).json()
        first = await client.post(
            f"{API}/applications", headers=h, json={"source": "preapproved", "offer_id": offer["offer_id"]}
        )
        again = await client.post(
            f"{API}/applications", headers=h, json={"source": "preapproved", "offer_id": offer["offer_id"]}
        )

        assert first.status_code == 201
        assert first.json()["requested_amount"] == {"value": 120_000_000, "currency": "RUB"}
        assert again.status_code == 410
        assert again.json()["error"]["code"] == "OFFER_EXPIRED"
        assert (await client.get(f"{API}/offers/preapproved", headers=h)).status_code == 204

    async def test_accountant_cannot_create(self, client: AsyncClient, demo: None) -> None:
        response = await client.post(
            f"{API}/applications",
            headers=auth(U_MALKINA),
            json={
                "source": "catalog",
                "product_code": "express",
                "amount": {"value": 50_000_000, "currency": "RUB"},
                "term_months": 12,
            },
        )

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN_ACTION"
        assert "owner" in response.json()["error"]["details"]["allowed_roles"]

    async def test_keep_requested_marks_warning_accepted(self, client: AsyncClient, demo: None) -> None:
        body = await create_from_recommendation(client, keep_requested=True)

        assert body["requested_amount"]["value"] == 200_000_000
        assert body["client_warning_accepted"] is True


class TestDraft:
    async def test_patch_with_stale_version(self, client: AsyncClient, demo: None) -> None:
        h = auth(U_LES)
        first = await client.patch(
            f"{API}/applications/{DRAFT_APP}",
            headers=h,
            json={"version": 1, "form": {"step": "company", "data": {"note": "x"}}},
        )
        stale = await client.patch(f"{API}/applications/{DRAFT_APP}", headers=h, json={"version": 1, "form": {}})

        assert first.status_code == 200
        assert (first.json()["version"], first.json()["form"]["step"]) == (2, "company")
        assert stale.status_code == 409
        assert stale.json()["error"]["code"] == "VERSION_CONFLICT"

    async def test_requirements(self, client: AsyncClient, demo: None) -> None:
        body = (await client.get(f"{API}/applications/{DRAFT_APP}/requirements", headers=auth(U_LES))).json()
        status = {i["code"]: (i["necessity"], i["status"]) for i in body["items"]}

        assert status["consent_bki"] == ("required", "missing")
        assert status["consent_pd"] == ("required", "done")
        assert status["company_docs"] == ("required", "done")
        # отчётность ситуативная: заявку можно отправить, банк запросит её сам (сценарий Б)
        assert status["fin_statements_2025"] == ("situational", "missing")
        assert body["can_submit"] is False

    async def test_wrong_code_counts_attempts(self, client: AsyncClient, demo: None) -> None:
        h = auth(U_LES)
        challenge = (
            await client.post(f"{API}/applications/{DRAFT_APP}/consents/consent_bki/challenge", headers=h)
        ).json()
        wrong = "0000" if challenge["demo_code"] != "0000" else "1111"
        responses = [
            await client.post(
                f"{API}/applications/{DRAFT_APP}/consents/consent_bki/confirm",
                headers=h,
                json={"challenge_id": challenge["challenge_id"], "code": wrong},
            )
            for _ in range(6)
        ]
        last = await client.post(
            f"{API}/applications/{DRAFT_APP}/consents/consent_bki/confirm",
            headers=h,
            json={"challenge_id": challenge["challenge_id"], "code": challenge["demo_code"]},
        )

        assert [r.json()["error"]["code"] for r in responses] == ["INVALID_CODE"] * 6
        assert responses[0].json()["error"]["details"] == {"attempts_left": 4}
        assert last.status_code == 422

    async def test_submit_requires_consent(self, client: AsyncClient, demo: None) -> None:
        response = await client.post(f"{API}/applications/{DRAFT_APP}/submit", headers=auth(U_LES))

        assert response.status_code == 422
        assert response.json()["error"] == {
            "code": "REQUIREMENTS_NOT_MET",
            "message": "Не выполнены условия отправки",
            "details": {"missing": ["consent_bki"]},
        }

    async def test_accountant_hands_off_to_submitter(self, client: AsyncClient, demo: None) -> None:
        app = await create_from_recommendation(client, keep_requested=False)
        members = (await client.get(f"{API}/company/members", headers=auth(U_MALKINA))).json()
        les = next(m for m in members if m["last_name"] == "Лес")
        malkina = next(m for m in members if m["last_name"] == "Малькина")

        bad = await client.post(
            f"{API}/applications/{app['id']}/handoff", headers=auth(U_MALKINA), json={"member_id": malkina["id"]}
        )
        task = await client.post(
            f"{API}/applications/{app['id']}/handoff", headers=auth(U_MALKINA), json={"member_id": les["id"]}
        )

        assert bad.status_code == 422
        assert task.status_code == 200
        assert (task.json()["type"], task.json()["assignee"]["name"]) == ("send_application", "Лес И. О.")
        mine = (await client.get(f"{API}/tasks", headers=auth(U_LES), params={"scope": "mine"})).json()
        assert any(t["type"] == "send_application" for t in mine)


class TestScenarios:
    async def test_counter_offer_accept_sign_and_issue(self, client: AsyncClient, demo: None) -> None:
        """Сценарий А: 2 000 000 ₽ на 24 мес, балл 62, аналитик даёт 1 500 000 ₽ на 36 мес, две подписи, выдача."""
        app = await create_from_recommendation(client, keep_requested=True)
        detail = await submit(client, app["id"])
        assert detail["status"] == "in_review"
        assert detail["load_at_submit"]["load_percent"] == 33.1

        analyst = auth(U_ANALYST)
        taken = (await client.post(f"{API}/bank/applications/{app['id']}/take", headers=analyst)).json()
        assert taken["scoring"]["total"] == 62
        assert taken["scoring"]["outcome"] == "counter_offer"

        decision = await client.post(
            f"{API}/bank/applications/{app['id']}/decision",
            headers=analyst,
            json={
                "type": "counter_offer",
                "amount": {"value": 150_000_000, "currency": "RUB"},
                "term_months": 36,
                "rate_percent": 15,
                "reason_code": "high_load",
            },
        )
        assert decision.status_code == 200

        client_view = (await client.get(f"{API}/applications/{app['id']}", headers=auth(U_SMIRNOV))).json()
        assert client_view["status"] == "counter_offer"
        assert client_view["decision"]["offered"]["monthly_payment"] == {"value": 5_199_800, "currency": "RUB"}
        assert client_view["decision"]["text_source"] == "template"
        assert "отказано" not in client_view["decision"]["explanation_text"].lower()
        assert {"offer.accept", "offer.decline"} <= set(client_view["available_actions"])

        # сотрудник по финансированию решение по предложению не принимает
        forbidden = await client.post(f"{API}/applications/{app['id']}/offer/accept", headers=auth(U_LES))
        assert forbidden.status_code == 403

        accepted = (await client.post(f"{API}/applications/{app['id']}/offer/accept", headers=auth(U_SMIRNOV))).json()
        assert accepted["status"] == "signing"
        assert accepted["signing"]["required_count"] == 2

        early = await client.post(f"{API}/applications/{app['id']}/signing/challenge", headers=auth(U_PETROV))
        assert early.status_code == 403

        first = await sign(client, app["id"], U_SMIRNOV)
        assert first["signed_count"] == 1
        still = (await client.get(f"{API}/applications/{app['id']}", headers=auth(U_SMIRNOV))).json()
        assert still["status"] == "signing"

        await sign(client, app["id"], U_PETROV)
        issued = (await client.get(f"{API}/applications/{app['id']}", headers=auth(U_SMIRNOV))).json()
        assert issued["status"] == "issued"
        loans = (await client.get(f"{API}/loans", headers=auth(U_SMIRNOV))).json()
        loan = next(x for x in loans if x["application_id"] == app["id"])
        assert (loan["amount"]["value"], loan["term_months"], loan["source"]) == (150_000_000, 36, "system")
        assert len((await client.get(f"{API}/loans/{loan['id']}", headers=auth(U_SMIRNOV))).json()["schedule"]) == 36

    async def test_recommended_terms_are_auto_approved(self, client: AsyncClient, demo: None) -> None:
        """1 500 000 ₽ на 36 мес: нагрузка 26,2%, балл 72, проверки без предупреждений: авторешение."""
        app = await create_from_recommendation(client, keep_requested=False)
        detail = await submit(client, app["id"])

        assert detail["status"] == "approved"
        assert detail["decision"]["decided_by"] == "auto"
        tasks = (await client.get(f"{API}/tasks", headers=auth(U_SMIRNOV), params={"scope": "mine"})).json()
        assert any(t["type"] == "accept_offer" for t in tasks)

    async def test_info_request_reassign_and_answer(self, client: AsyncClient, demo: None) -> None:
        """Сценарий Б: банк просит отчётность, собственник передаёт задачу бухгалтеру, бухгалтер отвечает."""
        analyst = auth(U_ANALYST)
        await client.post(f"{API}/bank/applications/{REVIEW_APP}/take", headers=analyst)
        await client.post(
            f"{API}/bank/applications/{REVIEW_APP}/decision",
            headers=analyst,
            json={
                "type": "request_info",
                "question": "Приложите бухгалтерскую отчётность за 2025 год",
                "requested_document_types": ["fin_statements_2025"],
                "due_at": "2026-12-01T18:00:00+03:00",
            },
        )
        tasks = (await client.get(f"{API}/tasks", headers=auth(U_SMIRNOV), params={"scope": "mine"})).json()
        task = next(t for t in tasks if t["type"] == "info_request")
        members = (await client.get(f"{API}/company/members", headers=auth(U_SMIRNOV))).json()
        kotov = next(m for m in members if m["last_name"] == "Котов")
        malkina = next(m for m in members if m["last_name"] == "Малькина")

        refused = await client.post(
            f"{API}/tasks/{task['id']}/reassign", headers=auth(U_SMIRNOV), json={"member_id": kotov["id"]}
        )
        assert refused.status_code == 422
        await client.patch(
            f"{API}/company/members/{malkina['id']}", headers=auth(U_SMIRNOV), json={"permissions": ["sign"]}
        )
        no_right = await client.post(
            f"{API}/tasks/{task['id']}/reassign", headers=auth(U_SMIRNOV), json={"member_id": malkina["id"]}
        )
        assert no_right.status_code == 422
        assert no_right.json()["error"]["message"].startswith("У сотрудника нет права")
        await client.patch(
            f"{API}/company/members/{malkina['id']}", headers=auth(U_SMIRNOV), json={"role": "cfo_or_accountant"}
        )

        moved = await client.post(
            f"{API}/tasks/{task['id']}/reassign", headers=auth(U_SMIRNOV), json={"member_id": malkina["id"]}
        )
        assert moved.json()["waiting_for_text"] == "Ждём: Малькина А. В. (бухгалтер)"

        request_id = task["cta"]["route"].rsplit("/", 1)[1]
        doc = await client.post(
            f"{API}/documents",
            headers=auth(U_MALKINA),
            files={"file": ("otchet.pdf", b"%PDF-1.4\n%demo\n", "application/pdf")},
            data={"scope": "company", "document_type": "fin_statements_2025", "info_request_id": request_id},
        )
        assert doc.status_code == 201
        answer = await client.post(
            f"{API}/applications/{REVIEW_APP}/info-requests/{request_id}/respond",
            headers=auth(U_MALKINA),
            json={"document_ids": [doc.json()["id"]]},
        )

        assert answer.json()["status"] == "answered"
        assert answer.json()["response"]["answered_by"]["name"] == "Малькина А. В."
        detail = (await client.get(f"{API}/applications/{REVIEW_APP}", headers=auth(U_SMIRNOV))).json()
        assert detail["status"] == "in_review"

    async def test_decline_counter_offer(self, client: AsyncClient, demo: None) -> None:
        app = await create_from_recommendation(client, keep_requested=True)
        await submit(client, app["id"])
        await client.post(
            f"{API}/bank/applications/{app['id']}/decision",
            headers=auth(U_ANALYST),
            json={
                "type": "counter_offer",
                "amount": {"value": 150_000_000, "currency": "RUB"},
                "term_months": 36,
                "rate_percent": 15,
                "reason_code": "high_load",
            },
        )

        response = await client.post(
            f"{API}/applications/{app['id']}/offer/decline", headers=auth(U_SMIRNOV), json={"reason": "Нужна вся сумма"}
        )

        assert response.json()["status"] == "cancelled"
        assert (await client.get(f"{API}/tasks", headers=auth(U_SMIRNOV), params={"scope": "all"})).json()[0][
            "type"
        ] != "accept_offer"

    async def test_rejection_without_forbidden_word(self, client: AsyncClient, demo: None) -> None:
        app = await create_from_recommendation(client, keep_requested=True)
        await submit(client, app["id"])

        await client.post(
            f"{API}/bank/applications/{app['id']}/decision",
            headers=auth(U_ANALYST),
            json={"type": "reject", "reason_codes": ["high_load"]},
        )
        decision = (await client.get(f"{API}/applications/{app['id']}", headers=auth(U_SMIRNOV))).json()["decision"]

        assert decision["type"] == "rejected"
        assert decision["explanation_text"].startswith("Сейчас не можем выдать кредит")
        assert decision["improve_tips"]


class TestTransitions:
    @pytest.mark.parametrize(
        ("app_id", "action"),
        [
            (SIGNING_APP, "submit"),
            (SIGNING_APP, "offer/accept"),
            (REVIEW_APP, "offer/accept"),
            (REVIEW_APP, "submit"),
        ],
    )
    async def test_invalid_transition_is_409(
        self, client: AsyncClient, demo: None, app_id: uuid.UUID, action: str
    ) -> None:
        response = await client.post(f"{API}/applications/{app_id}/{action}", headers=auth(U_SMIRNOV))

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "INVALID_TRANSITION"

    async def test_cancel_issued_is_409(self, client: AsyncClient, demo: None) -> None:
        response = await client.post(f"{API}/applications/{uid(1006)}/cancel", headers=auth(U_SMIRNOV))

        assert response.status_code == 409

    async def test_bank_decision_only_in_review(self, client: AsyncClient, demo: None) -> None:
        response = await client.post(
            f"{API}/bank/applications/{SIGNING_APP}/decision", headers=auth(U_ANALYST), json={"type": "approve"}
        )

        assert response.status_code == 409

    async def test_cancel_draft_writes_timeline(self, client: AsyncClient, demo: None) -> None:
        body = (
            await client.post(
                f"{API}/applications/{DRAFT_APP}/cancel", headers=auth(U_LES), json={"reason": "Передумали"}
            )
        ).json()

        assert body["status"] == "cancelled"
        assert body["timeline"][-1]["description"] == "Передумали"

    async def test_idempotent_submit_replays_response(self, client: AsyncClient, demo: None) -> None:
        app = await create_from_recommendation(client, keep_requested=True)
        await sign_consent(client, app["id"])
        headers = {**auth(U_SMIRNOV), "Idempotency-Key": str(uuid.uuid4())}

        first = await client.post(f"{API}/applications/{app['id']}/submit", headers=headers)
        second = await client.post(f"{API}/applications/{app['id']}/submit", headers=headers)

        assert first.status_code == second.status_code == 200
        assert second.headers["idempotent-replayed"] == "true"
        assert second.json()["status"] == "submitted"


class TestTemplatesWithoutLlm:
    async def test_all_texts_from_templates(self, client: AsyncClient, demo: None) -> None:
        _, rec = await recommendation(client)
        readiness = (await client.get(f"{API}/company/readiness", headers=auth(U_SMIRNOV))).json()
        summary = (
            await client.post(f"{API}/bank/applications/{REVIEW_APP}/ai-summary", headers=auth(U_ANALYST))
        ).json()

        assert rec["text_source"] == readiness["text_source"] == summary["ai_summary"]["text_source"] == "template"
