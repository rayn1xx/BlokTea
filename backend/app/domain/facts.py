"""Факты о компании, посчитанные кодом из моков и данных кабинета. Вход для скоринга, готовности и подбора."""

from dataclasses import dataclass, field
from datetime import date


@dataclass(frozen=True)
class MonthFlow:
    month: str  # "2026-01"
    inflow: int
    outflow: int


@dataclass(frozen=True)
class CompanyFacts:
    legal_form: str
    okved_main: str
    registration_date: date
    today: date
    registry_status: str | None  # None: реестр недоступен
    msp_category: str | None = None

    # финансы: None, если операции из Альфа-Бизнеса недоступны
    monthly_inflow_avg: int | None = None
    monthly_outflow_avg: int | None = None
    current_payments: int | None = None
    months: list[MonthFlow] = field(default_factory=list)

    # БКИ: None, если бюро недоступно
    overdue_days_current: int | None = None
    max_overdue_days_12m: int | None = None

    # ФНС «Прозрачный бизнес»
    tax_debt: int | None = None
    mass_address: bool = False

    # документы компании для готовности
    missing_required_documents: list[str] = field(default_factory=list)
    missing_situational_documents: list[str] = field(default_factory=list)

    @property
    def free_cash_flow(self) -> int | None:
        if self.monthly_inflow_avg is None or self.monthly_outflow_avg is None:
            return None
        return self.monthly_inflow_avg - self.monthly_outflow_avg

    @property
    def business_age_months(self) -> int:
        from app.domain.finance import months_between

        return months_between(self.registration_date, self.today)

    @property
    def okved_code(self) -> str:
        return self.okved_main.split()[0] if self.okved_main else ""

    @property
    def finance_available(self) -> bool:
        return self.free_cash_flow is not None and self.current_payments is not None

    @property
    def bki_available(self) -> bool:
        return self.overdue_days_current is not None


def low_months(months: list[MonthFlow], ratio: float = 0.8) -> list[int]:
    """Номера месяцев (1-12) с поступлениями ниже 80% среднего: сезонный спад."""
    if not months:
        return []
    avg = sum(m.inflow for m in months) / len(months)
    return sorted({int(m.month[5:7]) for m in months if 0 < m.inflow < avg * ratio})


def empty_months(months: list[MonthFlow]) -> int:
    return sum(1 for m in months if m.inflow <= 0)
