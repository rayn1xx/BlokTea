from datetime import date

import pytest

from app.domain import matching, readiness, scoring, state_machine
from app.domain.facts import CompanyFacts, MonthFlow
from app.domain.finance import Thresholds, annuity_payment, load_percent, payment_schedule
from mocks import data as mocks_data

T = Thresholds()
FREE_CASH_FLOW = 650_000_00
CURRENT_PAYMENTS = 118_400_00


def demo_months() -> list[MonthFlow]:
    result = []
    for year, month in [(2025, m) for m in range(10, 13)] + [(2026, m) for m in range(1, 10)]:
        txs = mocks_data.month_transactions(mocks_data.MASHPROM_INN, year, month)
        inflow = sum(t["amount"]["value"] for t in txs if t["category"] == "inflow")
        outflow = sum(t["amount"]["value"] for t in txs if t["category"] == "outflow_operating")
        result.append(MonthFlow(f"{year}-{month:02d}", inflow, outflow))
    return result


def demo_facts(**overrides) -> CompanyFacts:
    months = demo_months()
    data = dict(
        legal_form="OOO",
        okved_main="25.62 Обработка металлических изделий механическая",
        registration_date=date(2015, 3, 12),
        today=date(2026, 10, 22),
        registry_status="active",
        msp_category="micro",
        monthly_inflow_avg=sum(m.inflow for m in months) // 12,
        monthly_outflow_avg=sum(m.outflow for m in months) // 12,
        current_payments=CURRENT_PAYMENTS,
        months=months,
        overdue_days_current=0,
        max_overdue_days_12m=0,
        tax_debt=0,
        missing_situational_documents=["fin_statements_2025"],
    )
    data.update(overrides)
    return CompanyFacts(**data)


class TestPaymentAndLoad:
    @pytest.mark.parametrize(
        ("amount", "term", "payment", "total", "load"),
        [
            (2_000_000, 24, 96_973, 215_373, 33.1),
            (2_000_000, 36, 69_331, 187_731, 28.9),
            (1_500_000, 36, 51_998, 170_398, 26.2),
            (1_200_000, 24, 58_184, 176_584, 27.2),
        ],
    )
    def test_control_example(self, amount: int, term: int, payment: int, total: int, load: float) -> None:
        new_payment = annuity_payment(amount * 100, term, 15)

        assert new_payment == payment * 100
        assert new_payment + CURRENT_PAYMENTS == total * 100
        assert load_percent(new_payment, CURRENT_PAYMENTS, FREE_CASH_FLOW) == load

    def test_mock_cash_flow_matches_spec(self) -> None:
        facts = demo_facts()

        assert facts.monthly_inflow_avg == 2_100_000_00
        assert facts.monthly_outflow_avg == 1_450_000_00
        assert facts.free_cash_flow == FREE_CASH_FLOW

    def test_schedule_repays_principal(self) -> None:
        calc = payment_schedule(1_500_000_00, 36, 15, date(2026, 10, 22))

        assert len(calc["schedule"]) == 36
        assert sum(r["principal"]["value"] for r in calc["schedule"]) == 1_500_000_00
        assert calc["schedule"][-1]["balance"]["value"] == 0
        assert calc["monthly_payment"]["value"] == 51_998_00

    def test_non_positive_cash_flow_is_not_computed(self) -> None:
        assert load_percent(10, 10, 0) > 100


class TestMatching:
    NEED = {
        "purpose": "working_capital",
        "amount": {"value": 2_000_000_00, "currency": "RUB"},
        "term_months": 24,
        "need_type": "one_time",
        "disbursement": "lump_sum",
        "urgency": "week",
        "collateral": None,
    }

    def recommend(self, **need) -> dict:
        facts = demo_facts()
        items = readiness.items(facts, T, annuity_payment(2_000_000_00, 24, 15))
        return matching.recommend({**self.NEED, **need}, {"skipped": True}, facts, T, items, "нет отчётности")

    def test_spec_example(self) -> None:
        result = self.recommend()
        primary = result["primary"]

        assert (primary["product"]["code"], primary["amount"]["value"], primary["term_months"]) == (
            "working_capital",
            1_500_000_00,
            36,
        )
        assert primary["load"]["load_percent"] == 26.2
        assert primary["fit"] == "high"

        alternative = result["alternatives"][0]
        assert (alternative["amount"]["value"], alternative["term_months"]) == (2_000_000_00, 36)
        assert alternative["load"]["load_percent"] == 28.9
        assert alternative["fit_label"] == "На границе"

        overdraft = result["alternatives"][1]
        assert (overdraft["product"]["code"], overdraft["amount"]["value"]) == ("overdraft", 900_000_00)

        assert result["requested"]["load"]["load_percent"] == 33.1
        warning = next(w for w in result["warnings"] if w["code"] == "LOAD_ABOVE_THRESHOLD")
        assert warning["suggested"] == {"amount": {"value": 1_500_000_00, "currency": "RUB"}, "term_months": 36}
        assert result["text_source"] == "template"
        assert result["is_preliminary"] is True

    def test_24_months_maximum(self) -> None:
        p = matching.PRODUCTS[0]
        best = matching.best_fit(p, 2_000_000_00, 24, demo_facts(), T.load_target_percent, extra_terms=0)

        assert (best.amount, best.term) == (1_100_000_00, 24)
        assert matching.option_load(best, demo_facts()) == 26.4

    def test_recurring_need_routes_to_overdraft_or_line(self) -> None:
        result = self.recommend(
            need_type="recurring", disbursement="tranches", amount={"value": 800_000_00, "currency": "RUB"}
        )

        assert result["primary"]["product"]["code"] in ("overdraft", "credit_line")

    def test_numbers_in_reasons_come_from_facts(self) -> None:
        reasons = [r["text"] for r in self.recommend()["primary"]["reasons"]]

        assert "Свободный денежный поток 650 000 ₽ в месяц" in reasons


class TestScoring:
    def test_demo_application_is_62(self) -> None:
        load = load_percent(annuity_payment(2_000_000_00, 24, 15), CURRENT_PAYMENTS, FREE_CASH_FLOW)
        result = scoring.score(demo_facts(), load, T)

        assert {f["code"]: f["points"] for f in result["factors"]} == {
            "business_age": 20,
            "credit_history": 20,
            "debt_load": 0,
            "industry": 9,
            "turnover": 13,
        }
        assert result["total"] == 62
        assert result["outcome"] == "counter_offer"

    def test_alternative_is_72_and_approved(self) -> None:
        load = load_percent(annuity_payment(1_500_000_00, 36, 15), CURRENT_PAYMENTS, FREE_CASH_FLOW)
        result = scoring.score(demo_facts(), load, T)

        assert result["total"] == 72
        assert result["outcome"] == "approved"

    @pytest.mark.parametrize(
        ("overrides", "stop"),
        [
            ({"registry_status": "liquidating"}, "Компания не действует по данным реестра"),
            ({"overdue_days_current": 15}, "Текущая просрочка по данным БКИ"),
            ({"tax_debt": 10_001_00}, "Налоговая задолженность больше 10 000 ₽"),
            ({"registration_date": date(2026, 9, 1)}, "Бизнесу меньше 3 месяцев"),
            ({"monthly_outflow_avg": 2_100_000_00}, "Расходы не меньше поступлений"),
        ],
    )
    def test_stop_factors_reject_without_score(self, overrides: dict, stop: str) -> None:
        result = scoring.score(demo_facts(**overrides), 20.0, T)

        assert stop in result["stop_factors"]
        assert result["outcome"] == "rejected"

    @pytest.mark.parametrize(
        ("total", "outcome"),
        [
            (70, "approved"),
            (69, "counter_offer"),
            (55, "counter_offer"),
            (54, "manual_review"),
            (45, "manual_review"),
            (44, "rejected"),
        ],
    )
    def test_thresholds(self, total: int, outcome: str) -> None:
        assert scoring.outcome_for(total, [], T) == outcome

    def test_seasonal_dip_is_not_a_warning(self) -> None:
        checks = scoring.checks(
            demo_facts(),
            26.2,
            T,
            registry_ok=True,
            bki_ok=True,
            finance_ok=True,
            fns_ok=True,
            checked_at="2026-10-22T10:00:00+03:00",
        )

        assert {c["source"]: c["status"] for c in checks} == {
            "registry": "ok",
            "credit_bureau": "ok",
            "turnover": "ok",
            "fns_transparent": "ok",
            "load": "ok",
        }

    def test_unavailable_source_gives_error_check(self) -> None:
        checks = scoring.checks(
            demo_facts(),
            26.2,
            T,
            registry_ok=True,
            bki_ok=False,
            finance_ok=True,
            fns_ok=True,
            checked_at="2026-10-22T10:00:00+03:00",
        )

        assert next(c for c in checks if c["source"] == "credit_bureau")["status"] == "error"


class TestReadiness:
    def test_demo_request(self) -> None:
        result = readiness.readiness(demo_facts(), T, annuity_payment(2_000_000_00, 24, 15), "now")
        statuses = {i["code"]: i["status"] for i in result["items"]}

        assert statuses["debt_load"] == "fail"
        assert statuses["documents"] == "warning"
        assert result["disclaimer"] == "Это ориентир, а не решение банка"
        assert result["text_source"] == "template"

    def test_unknown_when_source_unavailable(self) -> None:
        facts = demo_facts(overdue_days_current=None, max_overdue_days_12m=None, tax_debt=None, registry_status=None)
        statuses = {i["code"]: i["status"] for i in readiness.items(facts, T)}

        assert statuses["credit_history"] == statuses["tax_debt"] == statuses["registry_status"] == "unknown"


ALLOWED = [
    ("draft", "submitted"),
    ("submitted", "in_review"),
    ("in_review", "approved"),
    ("in_review", "counter_offer"),
    ("in_review", "info_requested"),
    ("in_review", "rejected"),
    ("info_requested", "in_review"),
    ("approved", "signing"),
    ("counter_offer", "signing"),
    ("counter_offer", "cancelled"),
    ("signing", "issued"),
    *((s, "cancelled") for s in ("draft", "submitted", "in_review", "info_requested", "approved", "signing")),
]
STATUSES = [
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
]


class TestStateMachine:
    @pytest.mark.parametrize(("current", "target"), ALLOWED)
    def test_allowed(self, current: str, target: str) -> None:
        assert state_machine.can_transition(current, target)

    @pytest.mark.parametrize(
        ("current", "target"),
        [(a, b) for a in STATUSES for b in STATUSES if (a, b) not in ALLOWED],
    )
    def test_forbidden(self, current: str, target: str) -> None:
        assert not state_machine.can_transition(current, target)
