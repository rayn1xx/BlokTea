"""Платёж, график и долговая нагрузка (раздел 3.1 ТЗ). Все суммы в копейках."""

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal


def money(value: int) -> dict:
    return {"value": int(value), "currency": "RUB"}


def round_rubles(kopecks: Decimal | float) -> int:
    """Округление до целого рубля. Контрольный пример 3.1 (96 973 ₽) сходится с математическим округлением."""
    rubles = (Decimal(str(kopecks)) / 100).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return int(rubles) * 100


def round1(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def annuity_payment(amount: int, months: int, rate_percent: float) -> int:
    """payment = S × r / (1 - (1 + r)^-n), r = rate / 12 / 100; результат в копейках, целые рубли."""
    if months <= 0 or amount <= 0:
        return 0
    r = Decimal(str(rate_percent)) / 1200
    s = Decimal(amount)
    if r == 0:
        return round_rubles(s / months)
    return round_rubles(s * r / (1 - (1 + r) ** -months))


def overdraft_payment(limit: int, rate_percent: float) -> int:
    """Овердрафт гасится поступлениями, в нагрузку берём только проценты за месяц на весь лимит (допущение)."""
    return round_rubles(Decimal(limit) * Decimal(str(rate_percent)) / 1200)


def monthly_payment(product_code: str, amount: int, months: int, rate_percent: float) -> int:
    if product_code == "overdraft":
        return overdraft_payment(amount, rate_percent)
    return annuity_payment(amount, months, rate_percent)


def add_months(start: date, months: int) -> date:
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(start.day, 28))


def payment_schedule(amount: int, months: int, rate_percent: float, start: date) -> dict:
    """Аннуитетный график: PaymentCalcResponse из К.7."""
    payment = annuity_payment(amount, months, rate_percent)
    r = Decimal(str(rate_percent)) / 1200
    balance = amount
    rows = []
    for n in range(1, months + 1):
        interest = int((Decimal(balance) * r).quantize(Decimal(1), rounding=ROUND_HALF_UP))
        last = n == months
        principal = balance if last else min(payment - interest, balance)
        balance -= principal
        rows.append(
            {
                "n": n,
                "date": add_months(start, n).isoformat(),
                "payment": money(principal + interest),
                "principal": money(principal),
                "interest": money(interest),
                "balance": money(max(balance, 0)),
            }
        )
    total = sum(row["payment"]["value"] for row in rows)
    return {
        "monthly_payment": money(payment),
        "total_payment": money(total),
        "overpayment": money(max(total - amount, 0)),
        "schedule": rows,
    }


def overpayment(product_code: str, amount: int, months: int, rate_percent: float) -> int:
    if product_code == "overdraft":
        return overdraft_payment(amount, rate_percent) * months
    return max(annuity_payment(amount, months, rate_percent) * months - amount, 0)


@dataclass(frozen=True)
class Thresholds:
    approve_min: int = 70
    counter_offer_min: int = 55
    manual_review_min: int = 45
    load_threshold_percent: float = 30.0
    load_target_percent: float = 26.5

    def as_dict(self) -> dict:
        return {
            "approve_min": self.approve_min,
            "counter_offer_min": self.counter_offer_min,
            "manual_review_min": self.manual_review_min,
            "load_threshold_percent": self.load_threshold_percent,
            "load_target_percent": self.load_target_percent,
        }


# если свободный поток не положительный, нагрузка не считается; отдаём заведомо высокий процент
LOAD_NOT_COMPUTABLE = 999.9


def load_percent(new_payment: int, current_payments: int, free_cash_flow: int) -> float:
    if free_cash_flow <= 0:
        return LOAD_NOT_COMPUTABLE
    return round1((new_payment + current_payments) / free_cash_flow * 100)


def load_calc(free_cash_flow: int, current_payments: int, new_payment: int, thresholds: Thresholds) -> dict:
    """LoadCalc из К.7."""
    return {
        "free_cash_flow": money(free_cash_flow),
        "current_payments": money(current_payments),
        "new_payment": money(new_payment),
        "load_percent": load_percent(new_payment, current_payments, free_cash_flow),
        "threshold_percent": thresholds.load_threshold_percent,
        "target_percent": thresholds.load_target_percent,
    }


def format_rub(kopecks: int) -> str:
    rubles = round(kopecks / 100)
    return f"{rubles:,}".replace(",", " ") + " ₽"


def format_percent(value: float) -> str:
    text = f"{value:.1f}".rstrip("0").rstrip(".")
    return text.replace(".", ",")


def months_between(start: date, end: date) -> int:
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        months -= 1
    return max(months, 0)


def age_text(months: int) -> str:
    years, rest = divmod(months, 12)
    parts = []
    if years:
        parts.append(f"{years} {plural(years, 'год', 'года', 'лет')}")
    if rest or not years:
        parts.append(f"{rest} мес.")
    return " ".join(parts)


def plural(n: int, one: str, few: str, many: str) -> str:
    n = abs(n) % 100
    if 11 <= n <= 14:
        return many
    n %= 10
    if n == 1:
        return one
    if 2 <= n <= 4:
        return few
    return many
