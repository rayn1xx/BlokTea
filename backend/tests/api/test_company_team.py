import pytest
from httpx import AsyncClient

from app.seed import U_LES, U_MALKINA, U_ORLOVA, U_PETROV, U_SMIRNOV
from tests.api.conftest import auth

API = "/api/v1"


class TestFinance:
    async def test_summary_matches_control_example(self, client: AsyncClient, demo: None) -> None:
        body = (await client.get(f"{API}/company/finance-summary", headers=auth(U_SMIRNOV))).json()

        assert body["monthly_inflow_avg"]["value"]["value"] == 210_000_000
        assert body["monthly_inflow_avg"]["source"] == "alfa_lk"
        assert body["monthly_operating_outflow_avg"]["value"]["value"] == 145_000_000
        assert body["free_cash_flow"]["value"]["value"] == 65_000_000
        assert body["debts"]["total_monthly_payment"]["value"] == 11_840_000
        assert [d["source"] for d in body["debts"]["items"]] == ["alfa_lk", "alfa_lk", "bki"]
        assert body["seasonality"]["low_months"] == [1, 2]
        assert len(body["months"]) == 12
        assert body["stale"]["reason"] == "no_fin_statements_2025"
        assert body["multibank_connected"] is False

    async def test_client_edits_get_client_source(self, client: AsyncClient, demo: None) -> None:
        body = (
            await client.patch(
                f"{API}/company/finance-summary",
                headers=auth(U_MALKINA),
                json={
                    "monthly_inflow_avg": {"value": 220_000_000, "currency": "RUB"},
                    "debts_add": [{"lender": "Лизинг", "monthly_payment": {"value": 1_000_000, "currency": "RUB"}}],
                    "confirm": True,
                },
            )
        ).json()

        assert body["monthly_inflow_avg"]["source"] == "client"
        assert body["free_cash_flow"]["value"]["value"] == 75_000_000
        assert body["debts"]["total_monthly_payment"]["value"] == 12_840_000
        assert body["confirmed_at"] is not None

    async def test_financing_employee_confirms_but_cannot_edit(self, client: AsyncClient, demo: None) -> None:
        confirm = await client.patch(f"{API}/company/finance-summary", headers=auth(U_LES), json={"confirm": True})
        edit = await client.patch(
            f"{API}/company/finance-summary",
            headers=auth(U_LES),
            json={"monthly_inflow_avg": {"value": 1, "currency": "RUB"}, "confirm": True},
        )

        assert confirm.status_code == 200
        assert confirm.json()["confirmed_at"] is not None
        assert edit.status_code == 403

    async def test_alfa_unavailable(self, client: AsyncClient, demo: None, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MOCKS_DOWN", "alfa_lk")

        response = await client.get(f"{API}/company/finance-summary", headers=auth(U_SMIRNOV))

        assert response.status_code == 503

    async def test_readiness_unknown_when_bki_down(
        self, client: AsyncClient, demo: None, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("MOCKS_DOWN", "bki")

        body = (await client.get(f"{API}/company/readiness", headers=auth(U_SMIRNOV))).json()

        assert {i["code"]: i["status"] for i in body["items"]}["credit_history"] == "unknown"

    async def test_profile(self, client: AsyncClient, demo: None) -> None:
        body = (await client.get(f"{API}/company/profile", headers=auth(U_SMIRNOV))).json()

        assert body["registry"] == {
            "source": "EGRUL",
            "fetched_at": "2026-10-20T09:00:00+03:00",
            "confirmed": False,
            "issue_comment": None,
        }
        assert body["from_lk"]["alfa_loans"]["value"] == {
            "count": 2,
            "monthly_payment": {"value": 4_600_000, "currency": "RUB"},
        }
        assert body["from_lk"]["tax_regime"]["value"] == "usn_income_expense"
        assert body["available_actions"] == ["company.confirm_registry", "company.edit_details"]


class TestTeam:
    async def test_invite_accept_and_approve(self, client: AsyncClient, demo: None) -> None:
        invite = (
            await client.post(
                f"{API}/company/members/invite",
                headers=auth(U_SMIRNOV),
                json={
                    "last_name": "Новиков",
                    "first_name": "Илья",
                    "role": "authorized_employee",
                    "login_email": "ilya@test.local",
                },
            )
        ).json()
        assert invite["member"]["permissions"] == ["upload_documents"]
        assert invite["member"]["status"] == "invited"

        short = await client.post(
            f"{API}/auth/invite/accept", json={"invite_code": invite["invite_code"], "password": "123"}
        )
        assert short.status_code == 422
        accepted = await client.post(
            f"{API}/auth/invite/accept",
            json={"invite_code": invite["invite_code"].lower(), "password": "long-password"},
        )
        assert accepted.json() == {"status": "pending_approval", "login": "ilya@test.local"}

        tasks = (await client.get(f"{API}/tasks", headers=auth(U_SMIRNOV), params={"scope": "mine"})).json()
        assert any(t["type"] == "approve_member" for t in tasks)
        approved = await client.post(f"{API}/company/members/{invite['member']['id']}/approve", headers=auth(U_SMIRNOV))
        assert approved.json()["status"] == "active"
        login = await client.post(f"{API}/auth/login", json={"login": "ilya@test.local", "password": "long-password"})
        assert login.status_code == 200

    async def test_seed_invite_code(self, client: AsyncClient, demo: None) -> None:
        response = await client.post(
            f"{API}/auth/invite/accept", json={"invite_code": "4821-KX", "password": "kotov-password"}
        )

        assert response.json()["login"] == "oleg.kotov@test.local"

    @pytest.mark.parametrize(("code", "status", "error"), [("0000-ZZ", 404, "INVITE_NOT_FOUND")])
    async def test_unknown_invite(self, client: AsyncClient, demo: None, code: str, status: int, error: str) -> None:
        response = await client.post(
            f"{API}/auth/invite/accept", json={"invite_code": code, "password": "long-password"}
        )

        assert response.status_code == status
        assert response.json()["error"]["code"] == error

    async def test_only_owner_manages_team(self, client: AsyncClient, demo: None) -> None:
        response = await client.post(
            f"{API}/company/members/invite",
            headers=auth(U_LES),
            json={
                "last_name": "А",
                "first_name": "Б",
                "role": "owner",
                "login_email": "a@b.c",
            },
        )

        assert response.status_code == 403
        assert response.json()["error"]["details"]["allowed_roles"] == ["owner"]

    async def test_cannot_remove_self(self, client: AsyncClient, demo: None) -> None:
        members = (await client.get(f"{API}/company/members", headers=auth(U_SMIRNOV))).json()
        me = next(m for m in members if m["user_id"] == str(U_SMIRNOV))

        assert (await client.delete(f"{API}/company/members/{me['id']}", headers=auth(U_SMIRNOV))).status_code == 409

    async def test_signing_rules_version_conflict(self, client: AsyncClient, demo: None) -> None:
        rules = (await client.get(f"{API}/company/signing-rules", headers=auth(U_SMIRNOV))).json()
        assert [s["document"] for s in rules["signers"]] == ["contract", "surety"]

        updated = await client.put(f"{API}/company/signing-rules", headers=auth(U_SMIRNOV), json=rules)
        stale = await client.put(f"{API}/company/signing-rules", headers=auth(U_SMIRNOV), json=rules)
        other = await client.put(f"{API}/company/signing-rules", headers=auth(U_PETROV), json=updated.json())

        assert updated.json()["version"] == 2
        assert stale.status_code == 409
        assert stale.json()["error"]["code"] == "VERSION_CONFLICT"
        assert other.status_code == 200

    async def test_ip_default_rules(self, client: AsyncClient, demo: None) -> None:
        rules = (await client.get(f"{API}/company/signing-rules", headers=auth(U_ORLOVA))).json()

        assert rules["legal_form"] == "IP"
        assert rules["signers"] == [
            {"order": 1, "document": "contract", "user_id": None, "role": "owner", "required": True}
        ]


class TestFeedAndNotifications:
    async def test_feed_selected_by_rules(self, client: AsyncClient, demo: None) -> None:
        ooo = (await client.get(f"{API}/feed", headers=auth(U_SMIRNOV), params={"page_size": 50})).json()["items"]
        ip = (await client.get(f"{API}/feed", headers=auth(U_ORLOVA), params={"page_size": 50})).json()["items"]

        ooo_titles = {i["title"] for i in ooo}
        assert "Льготные кредиты для обрабатывающих производств" in ooo_titles
        assert "Поддержка общепита в Московской области" not in ooo_titles
        assert "Поддержка общепита в Московской области" in {i["title"] for i in ip}
        assert all(i["relevance_reason"].startswith("Показано, потому что:") for i in ooo + ip)

    async def test_notifications(self, client: AsyncClient, demo: None) -> None:
        h = auth(U_SMIRNOV)
        items = (await client.get(f"{API}/notifications", headers=h, params={"unread": "true"})).json()
        await client.post(f"{API}/notifications/{items[0]['id']}/read", headers=h)

        assert (
            len((await client.get(f"{API}/notifications", headers=h, params={"unread": "true"})).json())
            == len(items) - 1
        )
        await client.post(f"{API}/notifications/read-all", headers=h)
        assert (await client.get(f"{API}/home", headers=h)).json()["unread_notifications"] == 0


class TestProducts:
    async def test_catalog_by_legal_form(self, client: AsyncClient, demo: None) -> None:
        ip = (await client.get(f"{API}/products", headers=auth(U_ORLOVA), params={"legal_form": "IP"})).json()

        assert "gov_program" not in {p["code"] for p in ip}
        assert ip[0]["amount_min"]["currency"] == "RUB"

    async def test_calculator(self, client: AsyncClient, demo: None) -> None:
        body = (
            await client.post(
                f"{API}/calculator/payment",
                headers=auth(U_SMIRNOV),
                json={
                    "amount": {"value": 200_000_000, "currency": "RUB"},
                    "term_months": 24,
                    "rate_percent": 15,
                    "schedule": "annuity",
                },
            )
        ).json()

        assert body["monthly_payment"]["value"] == 9_697_300
        assert len(body["schedule"]) == 24

    async def test_matching_requires_fields_and_confirmation(self, client: AsyncClient, demo: None) -> None:
        h = auth(U_SMIRNOV)
        session = (await client.post(f"{API}/matching-sessions", headers=h)).json()

        incomplete = await client.patch(f"{API}/matching-sessions/{session['id']}", headers=h, json={"step": 2})
        same = await client.patch(f"{API}/matching-sessions/{session['id']}", headers=h, json={})

        assert incomplete.status_code == 422
        assert set(incomplete.json()["error"]["details"]) == {
            "purpose",
            "amount",
            "term_months",
            "need_type",
            "disbursement",
            "urgency",
        }
        assert same.json()["updated_at"] == session["updated_at"]
        assert session["extra"]["expected_payments"][0]["source"] == "alfa_lk"

    async def test_accountant_cannot_start_matching(self, client: AsyncClient, demo: None) -> None:
        assert (await client.post(f"{API}/matching-sessions", headers=auth(U_MALKINA))).status_code == 403
