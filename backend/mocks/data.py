"""Синтетические данные моков. Все компании и цифры вымышлены, совпадение с реальными случайно.

Суммы в копейках. Поступления по месяцам подобраны так, что среднее за любые 12 подряд идущих месяцев
ровно 2 100 000 ₽ (поступления) и 1 450 000 ₽ (операционные расходы): это контрольный пример 3.1 ТЗ.
"""

from datetime import date


def rub(rubles: int) -> int:
    return rubles * 100


def money(value: int) -> dict:
    return {"value": value, "currency": "RUB"}


MASHPROM_INN = "7700000001"
ORLOVA_INN = "770000000012"

COMPANIES: dict[str, dict] = {
    MASHPROM_INN: {
        "registry": {
            "source": "EGRUL",
            "legal_form": "OOO",
            "inn": MASHPROM_INN,
            "ogrn": "1150000000001",
            "kpp": "770001001",
            "full_name": "Общество с ограниченной ответственностью «Машпромхоз»",
            "short_name": "ООО «Машпромхоз»",
            "registration_date": "2015-03-12",
            "okved_main": "25.62 Обработка металлических изделий механическая",
            "okved_additional": [
                "25.11 Производство строительных металлических конструкций",
                "33.12 Ремонт машин и оборудования",
            ],
            "legal_address": "г. Москва, ул. Заводская, д. 7, стр. 2",
            "status": "active",
            "director": {"last_name": "Смирнов", "first_name": "Пётр", "middle_name": "Иванович"},
            "fetched_at": "2026-10-20T09:00:00+03:00",
        },
        "msp": {"category": "micro", "included_at": "2016-08-10"},
        "fns": {
            "tax_debt": money(0),
            "mass_address": False,
            "employees_count": 18,
            "fetched_at": "2026-10-20T09:00:00+03:00",
        },
        "bki": {
            "obligations": [
                {
                    "lender": "Другой банк",
                    "type": "loan",
                    "balance": money(rub(1_200_000)),
                    "monthly_payment": money(rub(72_400)),
                    "overdue_days_current": 0,
                    "max_overdue_days_12m": 0,
                }
            ],
            "requests_30d": 1,
            "fetched_at": "2026-10-21T14:36:00+03:00",
        },
        "employees": [
            {
                "login": "petr.smirnov@test.local",
                "last_name": "Смирнов",
                "first_name": "Пётр",
                "middle_name": "Иванович",
                "position": "Генеральный директор",
                "role": "owner",
            },
            {
                "login": "sergey.petrov@test.local",
                "last_name": "Петров",
                "first_name": "Сергей",
                "middle_name": "Александрович",
                "position": "Учредитель",
                "role": "owner",
            },
            {
                "login": "anna.malkina@test.local",
                "last_name": "Малькина",
                "first_name": "Анна",
                "middle_name": "Викторовна",
                "position": "Главный бухгалтер",
                "role": "cfo_or_accountant",
            },
            {
                "login": "irina.les@test.local",
                "last_name": "Лес",
                "first_name": "Ирина",
                "middle_name": "Олеговна",
                "position": "Менеджер по финансированию",
                "role": "financing_employee",
            },
        ],
        "accounts": [
            {
                "id": "acc-mph-1",
                "number_mask": "40702 •••• 4512",
                "name": "Расчётный счёт",
                "currency": "RUB",
                "balance": money(rub(1_842_500)),
                "is_primary": True,
            },
        ],
        "loans": [
            {
                "id": "alfa-loan-1",
                "product": "Кредит на любые цели",
                "product_code": "any_purpose",
                "amount": money(rub(500_000)),
                "balance": money(rub(200_000)),
                "monthly_payment": money(rub(31_800)),
                "rate_percent": 16.5,
                "term_months": 18,
                "next_payment_date": "2026-11-27",
                "overdue": False,
                "account_mask": "40702 •••• 4512",
            },
            {
                "id": "alfa-loan-2",
                "product": "Кредит на оборотные средства",
                "product_code": "working_capital",
                "amount": money(rub(150_000)),
                "balance": money(rub(80_000)),
                "monthly_payment": money(rub(14_200)),
                "rate_percent": 18.0,
                "term_months": 12,
                "next_payment_date": "2026-11-20",
                "overdue": False,
                "account_mask": "40702 •••• 4512",
            },
        ],
        "payroll": {"employees_count": 18, "as_of": "2026-10-01"},
        "accounting": {
            "tax_regime": "usn_income_expense",
            "alfa_accounting": False,
            "taxes_paid_12m": money(rub(1_284_000)),
            "as_of": "2026-10-01",
        },
        "invoices": [
            {
                "id": "inv-501",
                "counterparty": "ООО «СтанкоМаш»",
                "amount": money(rub(450_000)),
                "expected_date": "2026-11-10",
                "status": "issued",
            },
            {
                "id": "inv-502",
                "counterparty": "АО «ТехноПром»",
                "amount": money(rub(320_000)),
                "expected_date": "2026-11-18",
                "status": "issued",
            },
        ],
        "preapproved": [
            {
                "offer_id": "offer-pre-1",
                "product_code": "working_capital",
                "limit": money(rub(1_200_000)),
                "term_months": 24,
                "valid_until": "2026-11-30",
                "conditions_fixed": True,
            },
        ],
        "multibank": {"connected": False},
        # средние за год и коэффициенты месяцев спада (сумма коэффициентов за год ровно 12)
        "flows": {
            "inflow": rub(2_100_000),
            "outflow": rub(1_450_000),
            "inflow_low": 0.72,
            "outflow_low": 0.85,
            "low_months": [1, 2],
        },
        "loan_payments": [rub(31_800), rub(14_200), rub(72_400)],
    },
    ORLOVA_INN: {
        "registry": {
            "source": "EGRIP",
            "legal_form": "IP",
            "inn": ORLOVA_INN,
            "ogrn": "318500000000002",
            "kpp": None,
            "full_name": "Индивидуальный предприниматель Орлова Мария Сергеевна",
            "short_name": "ИП Орлова М. С.",
            "registration_date": "2018-06-04",
            "okved_main": "56.10 Деятельность ресторанов и услуги по доставке продуктов питания",
            "okved_additional": ["47.24 Торговля розничная хлебом и кондитерскими изделиями"],
            "legal_address": "Московская обл., г. Химки, ул. Лесная, д. 3",
            "status": "active",
            "director": {"last_name": "Орлова", "first_name": "Мария", "middle_name": "Сергеевна"},
            "fetched_at": "2026-10-19T09:00:00+03:00",
        },
        "msp": {"category": "micro", "included_at": "2018-08-10"},
        "fns": {
            "tax_debt": money(0),
            "mass_address": False,
            "employees_count": 6,
            "fetched_at": "2026-10-19T09:00:00+03:00",
        },
        "bki": {"obligations": [], "requests_30d": 0, "fetched_at": "2026-10-21T14:36:00+03:00"},
        "employees": [
            {
                "login": "maria.orlova@test.local",
                "last_name": "Орлова",
                "first_name": "Мария",
                "middle_name": "Сергеевна",
                "position": "Индивидуальный предприниматель",
                "role": "owner",
            },
        ],
        "accounts": [
            {
                "id": "acc-orl-1",
                "number_mask": "40802 •••• 7731",
                "name": "Расчётный счёт",
                "currency": "RUB",
                "balance": money(rub(413_000)),
                "is_primary": True,
            },
        ],
        "loans": [],
        "payroll": {"employees_count": 6, "as_of": "2026-10-01"},
        "accounting": {
            "tax_regime": "patent",
            "alfa_accounting": True,
            "taxes_paid_12m": money(rub(96_000)),
            "as_of": "2026-10-01",
        },
        "invoices": [],
        "preapproved": [],
        "multibank": {"connected": False},
        "flows": {
            "inflow": rub(780_000),
            "outflow": rub(560_000),
            "inflow_low": 1.0,
            "outflow_low": 1.0,
            "low_months": [],
        },
        "loan_payments": [],
    },
}

USERS = {e["login"]: {**e, "inn": inn} for inn, c in COMPANIES.items() for e in c["employees"]}

OWN_TRANSFER = rub(300_000)
LOAN_DISBURSEMENT = rub(500_000)


def month_value(avg: int, low_k: float, low_months: list[int], month: int) -> int:
    """Значение месяца: в месяцы спада avg × low_k, в остальные компенсация, чтобы год давал ровно 12 × avg."""
    if not low_months:
        return avg
    if month in low_months:
        return round(avg * low_k)
    low_total = round(avg * low_k) * len(low_months)
    rest = 12 * avg - low_total
    normal = 12 - len(low_months)
    return rest // normal


def split(total: int, shares: list[float]) -> list[int]:
    parts = [int(total * s) for s in shares[:-1]]
    parts.append(total - sum(parts))
    return parts


def month_transactions(inn: str, year: int, month: int) -> list[dict]:
    company = COMPANIES[inn]
    flows = company["flows"]
    inflow = month_value(flows["inflow"], flows["inflow_low"], flows["low_months"], month)
    outflow = month_value(flows["outflow"], flows["outflow_low"], flows["low_months"], month)
    prefix = f"{year}-{month:02d}"

    def tx(n: int, day: int, direction: str, category: str, amount: int, counterparty: str) -> dict:
        return {
            "id": f"tx-{inn}-{prefix}-{n}",
            "date": f"{prefix}-{day:02d}",
            "direction": direction,
            "category": category,
            "amount": money(amount),
            "counterparty": counterparty,
        }

    items = []
    for i, part in enumerate(split(inflow, [0.5, 0.3, 0.2])):
        items.append(tx(i, 5 + i * 7, "in", "inflow", part, f"Покупатель {i + 1}"))
    for i, (part, name) in enumerate(
        zip(split(outflow, [0.4, 0.45, 0.1, 0.05]), ["Зарплата", "Поставщики", "Аренда", "Прочие расходы"], strict=True)
    ):
        items.append(tx(10 + i, 10 + i * 4, "out", "outflow_operating", part, name))
    for i, payment in enumerate(company["loan_payments"]):
        items.append(tx(20 + i, 20 + i, "out", "loan_payment", payment, "Платёж по кредиту"))
    # переводы между своими счетами и выдача кредита в расчёт потока не входят
    if inn == MASHPROM_INN:
        items.append(tx(30, 15, "out", "own_transfer", OWN_TRANSFER, "Свой счёт"))
        items.append(tx(31, 16, "in", "own_transfer", OWN_TRANSFER, "Свой счёт"))
        if month == 3:
            items.append(tx(32, 3, "in", "loan_disbursement", LOAN_DISBURSEMENT, "Альфа-Банк"))
    return items


def transactions(inn: str, start: date, end: date) -> list[dict]:
    result = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        result.extend(
            t for t in month_transactions(inn, year, month) if start.isoformat() <= t["date"] <= end.isoformat()
        )
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return result
