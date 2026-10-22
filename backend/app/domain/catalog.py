"""Справочники прототипа: продукты, типы документов, роли и права, шаблоны запросов банка.

Деньги в копейках. Продукты с is_fictional=True придуманы командой, у остальных условия по данным
агрегаторов (source_note) и требуют сверки с alfabank.ru.
"""

from typing import Any

ROLES = (
    "owner",
    "director",
    "cfo_or_accountant",
    "financing_employee",
    "banking_employee",
    "authorized_employee",
)

PERMISSIONS = ("submit_applications", "upload_documents", "sign", "accept_offers", "manage_team")

# права по умолчанию (таблица К.5, допущение команды)
DEFAULT_PERMISSIONS: dict[str, list[str]] = {
    "owner": ["submit_applications", "upload_documents", "sign", "accept_offers", "manage_team"],
    "director": ["submit_applications", "upload_documents", "sign", "accept_offers"],
    "cfo_or_accountant": ["upload_documents", "sign"],
    "financing_employee": ["submit_applications", "upload_documents"],
    "banking_employee": ["submit_applications", "upload_documents"],
    "authorized_employee": ["upload_documents"],
}

ROLE_TITLES = {
    "owner": "собственник",
    "director": "директор",
    "cfo_or_accountant": "бухгалтер",
    "financing_employee": "финансы",
    "banking_employee": "банковские продукты",
    "authorized_employee": "уполномоченный сотрудник",
}


def roles_with(permission: str) -> list[str]:
    return [role for role, perms in DEFAULT_PERMISSIONS.items() if permission in perms]


PURPOSE_TITLES = {
    "equipment": "Покупка оборудования",
    "repair": "Ремонт",
    "current_expenses": "Текущие расходы",
    "working_capital": "Пополнение оборотных средств",
    "real_estate": "Покупка недвижимости",
    "gov_contract": "Исполнение госконтракта",
    "other": "Другая цель",
}

STATUS_TITLES = {
    "draft": "черновик",
    "submitted": "отправлена",
    "in_review": "на рассмотрении",
    "info_requested": "запрошены данные",
    "approved": "одобрена",
    "counter_offer": "другие условия",
    "rejected": "отказ",
    "signing": "подписание",
    "issued": "выдан",
    "cancelled": "отозвана",
}


def rub(rubles: int) -> int:
    return rubles * 100


SOURCE_NOTE = "По данным агрегаторов, 07.2026; сверить с alfabank.ru"

PRODUCTS: list[dict[str, Any]] = [
    {
        "code": "working_capital",
        "name": "Кредит на пополнение оборотных средств",
        "description": "Деньги на закупку товара, сырья и текущие расходы бизнеса",
        "purposes": ["working_capital", "current_expenses", "gov_contract"],
        "need_types": ["one_time"],
        "disbursement": ["lump_sum"],
        "amount_min": rub(300_000),
        "amount_max": rub(30_000_000),
        "term_min_months": 3,
        "term_max_months": 36,
        "rate_from_percent": 15.0,
        "collateral": "optional",
        "min_business_age_months": 6,
        "legal_forms": ["OOO", "IP"],
        "suits": ["Разовая закупка", "Кассовый разрыв на несколько месяцев"],
        "not_suits": ["Покупка недвижимости"],
        "required_document_types": ["charter", "fin_statements_2025"],
        "decision_time_text": "Решение за 1 рабочий день",
        "is_fictional": False,
        "source_note": SOURCE_NOTE,
    },
    {
        "code": "investment",
        "name": "Кредит на оборудование",
        "description": "Покупка и модернизация оборудования, транспорта и техники",
        "purposes": ["equipment", "repair"],
        "need_types": ["one_time"],
        "disbursement": ["lump_sum", "tranches"],
        "amount_min": rub(500_000),
        "amount_max": rub(100_000_000),
        "term_min_months": 12,
        "term_max_months": 84,
        "rate_from_percent": 14.5,
        "collateral": "optional",
        "min_business_age_months": 12,
        "legal_forms": ["OOO", "IP"],
        "suits": ["Покупка станков и техники", "Ремонт производственной линии"],
        "not_suits": ["Текущие расходы"],
        "required_document_types": ["charter", "fin_statements_2025"],
        "decision_time_text": "Решение за 2-3 рабочих дня",
        "is_fictional": False,
        "source_note": SOURCE_NOTE,
    },
    {
        "code": "overdraft",
        "name": "Овердрафт",
        "description": "Можно уходить в минус по счёту и закрывать кассовые разрывы",
        "purposes": ["current_expenses", "working_capital"],
        "need_types": ["recurring"],
        "disbursement": ["tranches"],
        "amount_min": rub(100_000),
        "amount_max": rub(5_000_000),
        "term_min_months": 12,
        "term_max_months": 12,
        "rate_from_percent": 17.0,
        "collateral": "none",
        "min_business_age_months": 6,
        "legal_forms": ["OOO", "IP"],
        "suits": ["Регулярные кассовые разрывы", "Оплата поставщикам до поступлений"],
        "not_suits": ["Крупные разовые покупки"],
        "required_document_types": [],
        "decision_time_text": "Решение в день обращения",
        "is_fictional": False,
        "source_note": SOURCE_NOTE,
    },
    {
        "code": "credit_line",
        "name": "Кредитная линия",
        "description": "Лимит, из которого можно брать деньги частями под разные задачи",
        "purposes": ["working_capital", "gov_contract", "current_expenses"],
        "need_types": ["recurring", "one_time"],
        "disbursement": ["tranches"],
        "amount_min": rub(1_000_000),
        "amount_max": rub(150_000_000),
        "term_min_months": 12,
        "term_max_months": 36,
        "rate_from_percent": 15.5,
        "collateral": "optional",
        "min_business_age_months": 12,
        "legal_forms": ["OOO", "IP"],
        "suits": ["Финансирование контрактов", "Закупки частями"],
        "not_suits": ["Одна небольшая покупка"],
        "required_document_types": ["charter", "fin_statements_2025"],
        "decision_time_text": "Решение за 2-3 рабочих дня",
        "is_fictional": False,
        "source_note": SOURCE_NOTE,
    },
    {
        "code": "express",
        "name": "Экспресс-кредит",
        "description": "Небольшая сумма без залога и почти без документов",
        "purposes": ["current_expenses", "repair", "other"],
        "need_types": ["one_time"],
        "disbursement": ["lump_sum"],
        "amount_min": rub(100_000),
        "amount_max": rub(1_000_000),
        "term_min_months": 3,
        "term_max_months": 24,
        "rate_from_percent": 19.0,
        "collateral": "none",
        "min_business_age_months": 6,
        "legal_forms": ["OOO", "IP"],
        "suits": ["Срочная небольшая сумма"],
        "not_suits": ["Суммы больше 1 000 000 ₽"],
        "required_document_types": [],
        "decision_time_text": "Предварительное решение за 15 минут",
        "is_fictional": True,
        "source_note": None,
    },
    {
        "code": "any_purpose",
        "name": "Кредит на любые цели",
        "description": "Без подтверждения цели, деньги на расчётный счёт",
        "purposes": ["other", "current_expenses", "repair", "equipment"],
        "need_types": ["one_time"],
        "disbursement": ["lump_sum"],
        "amount_min": rub(300_000),
        "amount_max": rub(10_000_000),
        "term_min_months": 6,
        "term_max_months": 36,
        "rate_from_percent": 18.0,
        "collateral": "none",
        "min_business_age_months": 12,
        "legal_forms": ["OOO", "IP"],
        "suits": ["Цель сложно подтвердить документами"],
        "not_suits": ["Нужна минимальная ставка"],
        "required_document_types": ["charter"],
        "decision_time_text": "Решение за 1 рабочий день",
        "is_fictional": False,
        "source_note": SOURCE_NOTE,
    },
    {
        "code": "gov_program",
        "name": "Кредит по льготной программе",
        "description": "Пониженная ставка за счёт господдержки малого бизнеса",
        "purposes": ["equipment", "working_capital", "real_estate"],
        "need_types": ["one_time"],
        "disbursement": ["lump_sum", "tranches"],
        "amount_min": rub(1_000_000),
        "amount_max": rub(50_000_000),
        "term_min_months": 12,
        "term_max_months": 60,
        "rate_from_percent": 11.0,
        "collateral": "required",
        "min_business_age_months": 12,
        "legal_forms": ["OOO"],
        "suits": ["Производство", "Обрабатывающие отрасли"],
        "not_suits": ["Торговля", "Срочные деньги"],
        "required_document_types": ["charter", "fin_statements_2025", "collateral_docs"],
        "decision_time_text": "Решение до 5 рабочих дней",
        "is_fictional": True,
        "source_note": None,
    },
]

PRODUCTS_BY_CODE = {p["code"]: p for p in PRODUCTS}


def product(code: str) -> dict[str, Any]:
    return PRODUCTS_BY_CODE[code]


DOCUMENT_TYPES: list[dict[str, Any]] = [
    {
        "code": "charter",
        "title": "Устав",
        "legal_forms": ["OOO"],
        "required_for_products": ["working_capital", "investment", "credit_line", "any_purpose", "gov_program"],
        "scope": "company",
        "accepted_formats": ["pdf", "jpg", "png"],
        "max_size_mb": 20,
        "max_age_days": None,
        "can_generate_from_lk": False,
    },
    {
        "code": "director_decision",
        "title": "Решение о назначении директора",
        "legal_forms": ["OOO"],
        "required_for_products": ["working_capital", "investment", "credit_line", "any_purpose", "gov_program"],
        "scope": "company",
        "accepted_formats": ["pdf", "jpg", "png"],
        "max_size_mb": 20,
        "max_age_days": None,
        "can_generate_from_lk": False,
    },
    {
        "code": "passport",
        "title": "Паспорт предпринимателя",
        "legal_forms": ["IP"],
        "required_for_products": [],
        "scope": "company",
        "accepted_formats": ["pdf", "jpg", "png"],
        "max_size_mb": 10,
        "max_age_days": None,
        "can_generate_from_lk": True,
    },
    {
        "code": "fin_statements_2025",
        "title": "Бухгалтерская отчётность за 2025 год",
        "legal_forms": ["OOO"],
        "required_for_products": ["working_capital", "investment", "credit_line", "gov_program"],
        "scope": "company",
        "accepted_formats": ["pdf", "xlsx"],
        "max_size_mb": 20,
        "max_age_days": 365,
        "can_generate_from_lk": False,
    },
    {
        "code": "tax_return",
        "title": "Налоговая декларация за 2025 год",
        "legal_forms": ["IP"],
        "required_for_products": ["working_capital", "investment", "credit_line"],
        "scope": "company",
        "accepted_formats": ["pdf", "xml"],
        "max_size_mb": 20,
        "max_age_days": 365,
        "can_generate_from_lk": True,
    },
    {
        "code": "other_bank_statements",
        "title": "Выписка по счёту в другом банке за 6 месяцев",
        "legal_forms": ["OOO", "IP"],
        "required_for_products": [],
        "scope": "application",
        "accepted_formats": ["pdf", "xlsx", "txt"],
        "max_size_mb": 20,
        "max_age_days": 30,
        "can_generate_from_lk": False,
    },
    {
        "code": "bank_statement",
        "title": "Выписка по счёту в Альфа-Банке",
        "legal_forms": ["OOO", "IP"],
        "required_for_products": [],
        "scope": "application",
        "accepted_formats": ["pdf"],
        "max_size_mb": 20,
        "max_age_days": 30,
        "can_generate_from_lk": True,
    },
    {
        "code": "turnover_statement",
        "title": "Справка об оборотах по счетам",
        "legal_forms": ["OOO", "IP"],
        "required_for_products": [],
        "scope": "application",
        "accepted_formats": ["pdf"],
        "max_size_mb": 20,
        "max_age_days": 30,
        "can_generate_from_lk": True,
    },
    {
        "code": "collateral_docs",
        "title": "Документы по залогу",
        "legal_forms": ["OOO", "IP"],
        "required_for_products": ["gov_program"],
        "scope": "application",
        "accepted_formats": ["pdf", "jpg", "png"],
        "max_size_mb": 30,
        "max_age_days": None,
        "can_generate_from_lk": False,
    },
    {
        "code": "patent",
        "title": "Патент на применение ПСН",
        "legal_forms": ["IP"],
        "required_for_products": [],
        "scope": "company",
        "accepted_formats": ["pdf", "jpg"],
        "max_size_mb": 10,
        "max_age_days": None,
        "can_generate_from_lk": False,
    },
    {
        "code": "other",
        "title": "Другой документ",
        "legal_forms": ["OOO", "IP"],
        "required_for_products": [],
        "scope": "company",
        "accepted_formats": ["pdf", "jpg", "png", "xlsx", "txt", "xml"],
        "max_size_mb": 20,
        "max_age_days": None,
        "can_generate_from_lk": False,
    },
]

DOCUMENT_TYPES_BY_CODE = {t["code"]: t for t in DOCUMENT_TYPES}


def document_title(code: str) -> str:
    return DOCUMENT_TYPES_BY_CODE.get(code, {}).get("title", code)


# что формирует Альфа-Бизнес по POST /documents/from-lk: kind -> тип документа
FROM_LK_KINDS = {
    "bank_statement": "bank_statement",
    "tax_data": "tax_return",
    "fin_turnover": "turnover_statement",
}

INFO_REQUEST_TEMPLATES = [
    {
        "code": "fin_statements",
        "title": "Отчётность за 2025 год",
        "question": "Приложите бухгалтерскую отчётность за 2025 год",
        "requested_document_types": ["fin_statements_2025"],
    },
    {
        "code": "other_bank",
        "title": "Выписка из другого банка",
        "question": "Приложите выписку по счёту в другом банке за последние 6 месяцев",
        "requested_document_types": ["other_bank_statements"],
    },
    {
        "code": "turnover",
        "title": "Справка об оборотах",
        "question": "Приложите справку об оборотах по счетам за 12 месяцев",
        "requested_document_types": ["turnover_statement"],
    },
    {
        "code": "collateral",
        "title": "Документы по залогу",
        "question": "Приложите документы, подтверждающие право собственности на залог",
        "requested_document_types": ["collateral_docs"],
    },
]

REJECTION_REASONS = [
    {"code": "high_load", "title": "Высокая долговая нагрузка"},
    {"code": "low_turnover", "title": "Недостаточные обороты"},
    {"code": "credit_history", "title": "Негативная кредитная история"},
    {"code": "tax_debt", "title": "Задолженность по налогам"},
    {"code": "business_age", "title": "Небольшой срок работы бизнеса"},
    {"code": "docs_mismatch", "title": "Документы не подтверждают данные заявки"},
]

REJECTION_REASON_TITLES = {r["code"]: r["title"] for r in REJECTION_REASONS}

# баллы отрасли по ОКВЭД (допущение команды): самый длинный совпавший префикс
INDUSTRY_POINTS = {
    "25.62": 9,
    "25": 9,
    "10": 10,
    "33": 10,
    "41": 6,
    "45": 9,
    "46": 10,
    "47": 10,
    "49": 8,
    "56": 8,
    "62": 12,
    "68": 7,
}
INDUSTRY_POINTS_DEFAULT = 8

MONTH_NAMES = [
    "январь",
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь",
]
