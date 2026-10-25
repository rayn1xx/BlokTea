from decimal import ROUND_HALF_UP, Decimal

from app.domain.catalog import INDUSTRY_POINTS, INDUSTRY_POINTS_DEFAULT, rub
from app.domain.facts import CompanyFacts, empty_months, low_months
from app.domain.finance import Thresholds, age_text, format_percent, format_rub

TAX_DEBT_LIMIT = rub(10_000)
MIN_BUSINESS_AGE_MONTHS = 3

FACTOR_TITLES = {
    "business_age": "Срок работы бизнеса",
    "credit_history": "Кредитная история",
    "debt_load": "Долговая нагрузка",
    "industry": "Отрасль",
    "turnover": "Обороты по счёту",
}


def business_age_points(months: int) -> int:
    if months >= 36:
        return 20
    if months >= 12:
        return 14
    if months >= 6:
        return 8
    return 0


def credit_history_points(facts: CompanyFacts) -> int:
    if not facts.bki_available or (facts.overdue_days_current or 0) > 0:
        return 0
    worst = facts.max_overdue_days_12m or 0
    if worst == 0:
        return 20
    if worst <= 30:
        return 10
    return 0


def debt_load_points(load: float) -> int:
    if load <= 20:
        return 25
    if load <= 25:
        return 18
    if load <= 30:
        return 10
    return 0


def industry_points(okved: str) -> int:
    code = okved.split()[0] if okved else ""
    for prefix in sorted(INDUSTRY_POINTS, key=len, reverse=True):
        if code.startswith(prefix):
            return INDUSTRY_POINTS[prefix]
    return INDUSTRY_POINTS_DEFAULT


def turnover_points(facts: CompanyFacts) -> int:
    if len(facts.months) < 6:
        return 0
    points = Decimal(20) - 8 * empty_months(facts.months) - Decimal("3.5") * len(low_months(facts.months))
    return max(int(points.quantize(Decimal(1), rounding=ROUND_HALF_UP)), 0)


def credit_history_text(facts: CompanyFacts) -> str:
    if not facts.bki_available:
        return "нет данных БКИ"
    if (facts.overdue_days_current or 0) > 0:
        return f"текущая просрочка {facts.overdue_days_current} дн."
    if (facts.max_overdue_days_12m or 0) > 0:
        return f"просрочки до {facts.max_overdue_days_12m} дн. за 12 мес"
    return "без просрочек"


def stop_factors(facts: CompanyFacts) -> list[str]:
    result = []
    if facts.registry_status is not None and facts.registry_status != "active":
        result.append("Компания не действует по данным реестра")
    if (facts.overdue_days_current or 0) > 0:
        result.append("Текущая просрочка по данным БКИ")
    if facts.tax_debt is not None and facts.tax_debt > TAX_DEBT_LIMIT:
        result.append("Налоговая задолженность больше 10 000 ₽")
    if facts.business_age_months < MIN_BUSINESS_AGE_MONTHS:
        result.append("Бизнесу меньше 3 месяцев")
    if facts.free_cash_flow is not None and facts.free_cash_flow <= 0:
        result.append("Расходы не меньше поступлений")
    return result


def outcome_for(total: int, stops: list[str], t: Thresholds) -> str:
    if stops or total < t.manual_review_min:
        return "rejected"
    if total >= t.approve_min:
        return "approved"
    if total >= t.counter_offer_min:
        return "counter_offer"
    return "manual_review"


def score(facts: CompanyFacts, load: float, t: Thresholds) -> dict:
    age = facts.business_age_months
    factors = [
        {
            "code": "business_age",
            "title": FACTOR_TITLES["business_age"],
            "value_text": age_text(age),
            "points": business_age_points(age),
            "max_points": 20,
        },
        {
            "code": "credit_history",
            "title": FACTOR_TITLES["credit_history"],
            "value_text": credit_history_text(facts),
            "points": credit_history_points(facts),
            "max_points": 20,
        },
        {
            "code": "debt_load",
            "title": FACTOR_TITLES["debt_load"],
            "value_text": f"{format_percent(load)}%" if facts.finance_available else "нет данных",
            "points": debt_load_points(load) if facts.finance_available else 0,
            "max_points": 25,
        },
        {
            "code": "industry",
            "title": FACTOR_TITLES["industry"],
            "value_text": f"ОКВЭД {facts.okved_code}",
            "points": industry_points(facts.okved_main),
            "max_points": 15,
        },
        {
            "code": "turnover",
            "title": FACTOR_TITLES["turnover"],
            "value_text": turnover_text(facts),
            "points": turnover_points(facts),
            "max_points": 20,
        },
    ]
    total = sum(f["points"] for f in factors)
    stops = stop_factors(facts)
    return {
        "total": total,
        "factors": factors,
        "thresholds": t.as_dict(),
        "outcome": outcome_for(total, stops, t),
        "stop_factors": stops,
    }


def turnover_text(facts: CompanyFacts) -> str:
    if facts.monthly_inflow_avg is None:
        return "нет данных"
    text = f"{format_rub(facts.monthly_inflow_avg)} в месяц"
    dips = low_months(facts.months)
    if empty_months(facts.months):
        text += ", есть месяцы без поступлений"
    elif dips:
        text += ", сезонный спад"
    return text


def factor_impact(points: int, max_points: int) -> str:
    share = points / max_points if max_points else 0
    if share >= 0.7:
        return "positive"
    if share <= 0.3:
        return "negative"
    return "neutral"


def risk_level(total: int | None, t: Thresholds) -> str | None:
    if total is None:
        return None
    if total >= t.approve_min:
        return "low"
    if total >= t.counter_offer_min:
        return "medium"
    return "high"


def checks(
    facts: CompanyFacts,
    load: float,
    t: Thresholds,
    *,
    registry_ok: bool,
    bki_ok: bool,
    finance_ok: bool,
    fns_ok: bool,
    checked_at: str,
) -> list[dict]:

    def result(source: str, status: str, summary: str, details: dict | None = None) -> dict:
        return {
            "source": source,
            "status": status,
            "summary": summary,
            "details": details or {},
            "checked_at": checked_at,
            "is_mock": True,
        }

    items = []
    if not registry_ok:
        items.append(result("registry", "error", "Реестр недоступен, проверьте вручную"))
    elif facts.registry_status == "active":
        items.append(result("registry", "ok", "Компания действует, данные совпадают", {"status": "active"}))
    else:
        items.append(
            result("registry", "stop", "Компания ликвидируется или ликвидирована", {"status": facts.registry_status})
        )

    if not bki_ok:
        items.append(result("credit_bureau", "error", "БКИ недоступно, проверьте вручную"))
    elif (facts.overdue_days_current or 0) > 0:
        items.append(
            result(
                "credit_bureau",
                "stop",
                f"Текущая просрочка {facts.overdue_days_current} дн.",
                {"overdue_days_current": facts.overdue_days_current},
            )
        )
    elif (facts.max_overdue_days_12m or 0) > 0:
        items.append(
            result(
                "credit_bureau",
                "warning",
                f"Были просрочки до {facts.max_overdue_days_12m} дн. за 12 месяцев",
                {"max_overdue_days_12m": facts.max_overdue_days_12m},
            )
        )
    else:
        items.append(result("credit_bureau", "ok", "Просрочек нет", {"max_overdue_days_12m": 0}))

    if not finance_ok:
        items.append(result("turnover", "error", "Операции по счетам недоступны"))
    else:
        dips = low_months(facts.months)
        empty = empty_months(facts.months)
        details = {"months": len(facts.months), "low_months": dips, "empty_months": empty}
        if len(facts.months) < 6:
            items.append(result("turnover", "warning", "История операций меньше 6 месяцев", details))
        elif empty:
            items.append(result("turnover", "warning", f"Месяцев без поступлений: {empty}", details))
        elif dips:
            items.append(result("turnover", "ok", "Обороты стабильны, есть сезонный спад", details))
        else:
            items.append(result("turnover", "ok", "Обороты стабильны", details))

    if not fns_ok:
        items.append(result("fns_transparent", "error", "Сервис ФНС недоступен, проверьте вручную"))
    elif facts.tax_debt is not None and facts.tax_debt > TAX_DEBT_LIMIT:
        items.append(
            result(
                "fns_transparent",
                "stop",
                f"Налоговая задолженность {format_rub(facts.tax_debt)}",
                {"tax_debt": facts.tax_debt},
            )
        )
    elif (facts.tax_debt or 0) > 0 or facts.mass_address:
        summary = (
            "Есть небольшая налоговая задолженность" if (facts.tax_debt or 0) > 0 else "Адрес массовой регистрации"
        )
        items.append(
            result(
                "fns_transparent", "warning", summary, {"tax_debt": facts.tax_debt, "mass_address": facts.mass_address}
            )
        )
    else:
        items.append(
            result(
                "fns_transparent",
                "ok",
                "Налоговой задолженности нет, адрес не массовый",
                {"tax_debt": 0, "mass_address": False},
            )
        )

    if not finance_ok:
        items.append(result("load", "error", "Нагрузку посчитать нельзя: нет данных об операциях"))
    elif facts.free_cash_flow is not None and facts.free_cash_flow <= 0:
        items.append(result("load", "stop", "Расходы не меньше поступлений", {"free_cash_flow": facts.free_cash_flow}))
    elif load > t.load_threshold_percent:
        items.append(
            result(
                "load",
                "warning",
                f"Нагрузка {format_percent(load)}% при пороге {format_percent(t.load_threshold_percent)}%",
                {"load_percent": load},
            )
        )
    else:
        items.append(
            result(
                "load",
                "ok",
                f"Нагрузка {format_percent(load)}% при пороге {format_percent(t.load_threshold_percent)}%",
                {"load_percent": load},
            )
        )
    return items


def checks_status(items: list[dict]) -> str:
    statuses = {c["status"] for c in items}
    if "stop" in statuses:
        return "stop"
    if statuses & {"warning", "error"}:
        return "warning"
    return "ok"
