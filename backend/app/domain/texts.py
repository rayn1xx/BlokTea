"""Шаблоны-заглушки ИИ-задач (раздел 8.6 ТЗ). Пока LLM не подключена, все тексты отсюда, text_source='template'.

Числа в шаблоны подставляет код, поэтому они всегда совпадают с расчётом.
"""

from app.domain.catalog import MONTH_NAMES, PURPOSE_TITLES
from app.domain.finance import age_text, format_percent, format_rub

TEMPLATE = "template"

DISCLAIMER = "Это ориентир, а не решение банка"


# И4. Причины рекомендации и предупреждения


def reason_text(code: str, value: str) -> str:
    templates = {
        "purpose": "Цель: {value}",
        "free_cash_flow": "Свободный денежный поток {value} в месяц",
        "business_age": "Бизнесу {value}",
        "credit_history": "Кредитная история {value}",
        "industry": "Отрасль: {value}",
        "load": "Платежи займут {value} свободного потока",
        "flexible": "Деньги можно брать частями, проценты только за использованное",
        "collateral": "С залогом: {value}",
        "as_requested": "Сумма, которую вы указали: {value}",
    }
    return templates.get(code, "{value}").format(value=value)


def warning_load_above_threshold(
    req_amount: int, req_term: int, req_load: float, threshold: float, amount: int, term: int, load: float
) -> str:
    return (
        f"На {format_rub(req_amount)} за {req_term} мес платежи по всем кредитам займут "
        f"{format_percent(req_load)}% свободного потока (порог {format_percent(threshold)}%). "
        f"С суммой {format_rub(amount)} на {term} мес: {format_percent(load)}%"
    )


def warning_term_extended(term: int) -> str:
    return f"Срок увеличен до {term} мес, чтобы снизить ежемесячный платёж"


def warning_collateral_needed() -> str:
    return "Для этого продукта нужен залог"


def warning_negative_cash_flow() -> str:
    return "Расходы не меньше поступлений, нагрузку посчитать нельзя. Проверьте данные о финансах"


def purpose_title(code: str | None) -> str:
    return PURPOSE_TITLES.get(code or "", "другая цель").lower()


def submit_requirements_text(legal_form: str) -> str:
    docs = (
        "устав и решение о назначении директора подставим из документов компании"
        if legal_form == "OOO"
        else ("данные ИП подставим из ЕГРИП")
    )
    return (
        "Для отправки нужно: согласие на запрос в бюро кредитных историй. "
        f"Согласие на обработку данных уже есть в Альфа-Бизнесе, {docs}"
    )


FIT_LABELS = {"high": "Высокий шанс", "medium": "Средний шанс", "low": "Низкий шанс"}
FIT_LABEL_BORDER = "На границе"


# И5. Объяснение решения


def decision_explanation(
    decision_type: str,
    *,
    amount: int | None,
    term: int | None,
    req_amount: int,
    req_load: float | None,
    threshold: float,
    factor_titles: list[str],
) -> str:
    if decision_type == "approved":
        return f"Банк готов выдать {format_rub(amount or req_amount)} на {term} мес"
    if decision_type == "counter_offer":
        text = f"Банк готов выдать {format_rub(amount or 0)} на {term} мес."
        if req_load is not None:
            text += (
                f" Почему: с учётом всех кредитов платёж на {format_rub(req_amount)} займёт "
                f"{format_percent(req_load)}% свободного денежного потока, порог {format_percent(threshold)}%"
            )
        return text
    factors = ", ".join(t.lower() for t in factor_titles) or "условия заявки"
    return f"Сейчас не можем выдать кредит. Что повлияло: {factors}"


IMPROVE_TIPS = {
    "debt_load": "Уменьшите сумму или увеличьте срок, чтобы платёж был меньше",
    "credit_history": "Погасите текущие просрочки и платите по кредитам вовремя",
    "business_age": "Вернитесь к заявке, когда бизнесу будет больше года",
    "turnover": "Проводите поступления через счёт регулярно, без перерывов",
    "industry": "Приложите контракты или договоры, которые подтверждают выручку",
    "documents": "Загрузите бухгалтерскую отчётность за 2025 год: она подтвердит выручку",
    "tax_debt": "Погасите налоговую задолженность",
    "registry_status": "Проверьте статус компании в ЕГРЮЛ",
}

FACTOR_TEXTS = {
    ("business_age", "positive"): "Компания давно работает, это повышает доверие",
    ("business_age", "neutral"): "Бизнес работает недолго, банку меньше данных",
    ("business_age", "negative"): "Бизнес работает совсем недавно",
    ("credit_history", "positive"): "Вы платите по кредитам вовремя",
    ("credit_history", "neutral"): "В прошлом были небольшие просрочки",
    ("credit_history", "negative"): "Есть просрочки по кредитам",
    ("debt_load", "positive"): "Платежи по кредитам с запасом укладываются в свободный денежный поток",
    ("debt_load", "neutral"): "Платежи по кредитам укладываются в свободный денежный поток почти без запаса",
    ("debt_load", "negative"): "Платежи по всем кредитам заняли бы больше порога свободного денежного потока",
    ("industry", "positive"): "Отрасль с низким уровнем риска",
    ("industry", "neutral"): "Отрасль со средним уровнем риска",
    ("industry", "negative"): "Отрасль с повышенным уровнем риска",
    ("turnover", "positive"): "Поступления на счёт стабильные",
    ("turnover", "neutral"): "Поступления на счёт неровные, есть сезонный спад",
    ("turnover", "negative"): "Были месяцы без поступлений на счёт",
}


def factor_text(code: str, impact: str, fallback: str) -> str:
    return FACTOR_TEXTS.get((code, impact), fallback)


# И6. Готовность

HOW_TO_IMPROVE = {
    "business_age": "Банки охотнее кредитуют бизнес старше года. Можно начать с небольшой суммы",
    "debt_load": "Уменьшите сумму или увеличьте срок, чтобы снизить платёж",
    "tax_debt": "Погасите налоговую задолженность и дождитесь обновления данных ФНС",
    "credit_history": "Погасите текущую просрочку. Без неё шанс на одобрение выше",
    "documents": "Загрузите недостающие документы в разделе «Документы»",
    "turnover": "Проводите поступления через счёт в Альфа-Банке каждый месяц",
    "registry_status": "Кредит можно получить только действующей компании",
}


def readiness_summary(level: str) -> str:
    return {
        "high": "Вы хорошо готовы к кредиту",
        "medium": "В целом вы готовы к кредиту, но есть что улучшить",
        "low": "Есть факторы, которые мешают получить кредит. Посмотрите, что можно улучшить",
    }[level]


# И3. Замечания по документам

ISSUE_TEXTS = {
    "inn_match": "ИНН в документе не совпадает с ИНН компании",
    "not_expired": "Документ старше {days} дней, загрузите свежий",
    "period_valid": "Период в документе не соответствует запросу",
    "type_match": "Тип документа не совпадает с запрошенным",
    "signature_present": "В документе не найдена подпись",
}

MANUAL_CHECK_TEXT = "Автоматическая проверка недоступна, документ проверит сотрудник банка"


# И7. Резюме для аналитика


def analyst_summary(
    *,
    company_name: str,
    registration_year: int,
    amount: int,
    term: int,
    purpose: str,
    score: int | None,
    load: float | None,
    threshold: float,
    seasonality_months: list[int],
    warning_accepted: bool,
) -> str:
    parts = [
        f"{company_name} работает с {registration_year} года, просит {format_rub(amount)} на {term} мес, цель: {purpose.lower()}."
    ]
    if score is not None:
        parts.append(f"Балл {score}.")
    if load is not None:
        above = ", выше порога" if load > threshold else ""
        parts.append(f"Нагрузка с новым платежом {format_percent(load)}%{above}.")
    if seasonality_months:
        parts.append("Сезонный спад поступлений: " + ", ".join(MONTH_NAMES[m - 1] for m in seasonality_months) + ".")
    if warning_accepted:
        parts.append("Клиент оставил сумму вопреки предупреждению о нагрузке.")
    return " ".join(parts)


def seasonality_text(months: list[int]) -> str:
    return "Спад поступлений: " + ", ".join(MONTH_NAMES[m - 1] for m in months)


def business_age_value(months: int) -> str:
    return age_text(months)
