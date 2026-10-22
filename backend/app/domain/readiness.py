"""Оценка готовности к кредиту (раздел 3.4 ТЗ)."""

from app.domain import texts
from app.domain.catalog import document_title
from app.domain.facts import CompanyFacts, empty_months
from app.domain.finance import LOAD_NOT_COMPUTABLE, Thresholds, format_percent, format_rub, load_percent
from app.domain.scoring import TAX_DEBT_LIMIT

TITLES = {
    "business_age": "Срок работы бизнеса",
    "debt_load": "Долговая нагрузка",
    "tax_debt": "Налоговая задолженность",
    "credit_history": "Кредитная история",
    "documents": "Документы",
    "turnover": "Обороты по счёту",
    "registry_status": "Статус в реестре",
}

EXPLANATIONS = {
    "business_age": "Банки охотнее кредитуют бизнес, который работает больше года",
    "debt_load": "Доля платежей по всем кредитам в свободном денежном потоке",
    "tax_debt": "По данным сервиса ФНС «Прозрачный бизнес»",
    "credit_history": "По данным бюро кредитных историй за 12 месяцев",
    "documents": "Обязательные документы компании и отчётность",
    "turnover": "Поступления на счета за последние 12 месяцев",
    "registry_status": "По данным ЕГРЮЛ или ЕГРИП",
}

UNKNOWN_TEXT = "нет данных"


def _item(code: str, status: str, value_text: str, action: dict | None = None) -> dict:
    return {
        "code": code,
        "title": TITLES[code],
        "status": status,
        "value_text": value_text,
        "explanation": EXPLANATIONS[code],
        "how_to_improve": None if status in ("ok", "unknown") else texts.HOW_TO_IMPROVE[code],
        "action": action,
    }


def items(facts: CompanyFacts, t: Thresholds, new_payment: int = 0) -> list[dict]:
    result = []

    age = facts.business_age_months
    status = "ok" if age >= 12 else "warning" if age >= 6 else "fail"
    result.append(_item("business_age", status, texts.business_age_value(age)))

    if not facts.finance_available:
        result.append(_item("debt_load", "unknown", UNKNOWN_TEXT))
    else:
        load = load_percent(new_payment, facts.current_payments or 0, facts.free_cash_flow or 0)
        if load == LOAD_NOT_COMPUTABLE:
            status, value = "fail", "расходы не меньше поступлений"
        else:
            status = (
                "ok" if load <= t.load_target_percent else "warning" if load <= t.load_threshold_percent else "fail"
            )
            value = f"{format_percent(load)}%"
        action = (
            {"type": "fill_details", "document_type": None, "route": "/onboarding/company"}
            if status == "fail"
            else None
        )
        result.append(_item("debt_load", status, value, action))

    if facts.tax_debt is None:
        result.append(_item("tax_debt", "unknown", UNKNOWN_TEXT))
    elif facts.tax_debt == 0:
        result.append(_item("tax_debt", "ok", "нет"))
    else:
        status = "warning" if facts.tax_debt <= TAX_DEBT_LIMIT else "fail"
        result.append(_item("tax_debt", status, format_rub(facts.tax_debt)))

    if not facts.bki_available:
        result.append(_item("credit_history", "unknown", UNKNOWN_TEXT))
    elif (facts.overdue_days_current or 0) > 0:
        result.append(_item("credit_history", "fail", f"текущая просрочка {facts.overdue_days_current} дн."))
    elif (facts.max_overdue_days_12m or 0) > 0:
        status = "warning" if (facts.max_overdue_days_12m or 0) <= 30 else "fail"
        result.append(_item("credit_history", status, f"просрочки до {facts.max_overdue_days_12m} дн."))
    else:
        result.append(_item("credit_history", "ok", "без просрочек"))

    if facts.missing_required_documents:
        code = facts.missing_required_documents[0]
        action = {"type": "upload_document", "document_type": code, "route": "/documents"}
        value = "не хватает: " + ", ".join(document_title(c).lower() for c in facts.missing_required_documents)
        result.append(_item("documents", "fail", value, action))
    elif facts.missing_situational_documents:
        code = facts.missing_situational_documents[0]
        action = {"type": "upload_document", "document_type": code, "route": "/documents"}
        value = "нет: " + ", ".join(document_title(c).lower() for c in facts.missing_situational_documents)
        result.append(_item("documents", "warning", value, action))
    else:
        result.append(_item("documents", "ok", "всё есть"))

    if not facts.finance_available:
        result.append(_item("turnover", "unknown", UNKNOWN_TEXT))
    else:
        value = f"{format_rub(facts.monthly_inflow_avg or 0)} в месяц"
        if len(facts.months) < 6:
            status = "fail"
        elif empty_months(facts.months):
            status = "warning"
        else:
            status = "ok"
        result.append(_item("turnover", status, value))

    if facts.registry_status is None:
        result.append(_item("registry_status", "unknown", UNKNOWN_TEXT))
    elif facts.registry_status == "active":
        result.append(_item("registry_status", "ok", "действует"))
    else:
        value = "ликвидация" if facts.registry_status == "liquidating" else "ликвидирована"
        result.append(_item("registry_status", "fail", value))

    return result


def level(readiness_items: list[dict]) -> str:
    statuses = [i["status"] for i in readiness_items]
    if "fail" in statuses:
        return "low"
    if statuses.count("ok") >= len(statuses) - 1 and "unknown" not in statuses:
        return "high"
    return "medium"


def readiness(facts: CompanyFacts, t: Thresholds, new_payment: int, calculated_at: str) -> dict:
    """Readiness из К.7. Тексты пока из шаблонов (задача И6)."""
    readiness_items = items(facts, t, new_payment)
    lvl = level(readiness_items)
    ok_count = sum(1 for i in readiness_items if i["status"] == "ok")
    return {
        "level": lvl,
        "ok_count": ok_count,
        "total": len(readiness_items),
        "items": readiness_items,
        "summary_text": texts.readiness_summary(lvl),
        "text_source": texts.TEMPLATE,
        "disclaimer": texts.DISCLAIMER,
        "calculated_at": calculated_at,
    }


def short(full: dict) -> dict:
    return {
        "ok_count": full["ok_count"],
        "total": full["total"],
        "items": [{"code": i["code"], "title": i["title"], "status": i["status"]} for i in full["items"]],
    }
