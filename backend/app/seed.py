"""Тестовые данные для локальной разработки: python -m app.seed (повторный запуск безопасен).

Логин ivanov@test.local из frontend/src/api/demo.ts не используем: фронт перехватывает его
и до бэкенда запрос не доходит.
"""

import asyncio
import uuid
from datetime import UTC, date, datetime, timedelta, timezone

from app.api.deps import get_password_hasher
from app.db.repositories import AccountRepository, ApplicationRepository, CompanyRepository, UserRepository
from app.db.session import SessionFactory, engine
from app.models import (
    Account,
    AccountOwnerType,
    AccountType,
    Application,
    ApplicationStatus,
    Company,
    CompanyVerification,
    LegalForm,
    MspCategory,
    RegistryStatus,
    User,
    UserRole,
)

COMPANY = dict(
    id=uuid.UUID("3b1e6c2a-5d4f-4a8b-9e10-2c3d4e5f6a01"),
    legal_form=LegalForm.OOO,
    inn="7701234567",
    ogrn="1157746123456",
    kpp="770101001",
    full_name="Общество с ограниченной ответственностью «Блок Ти»",
    short_name="ООО «Блок Ти»",
    registration_date=date(2015, 3, 12),
    okved_main="47.91",
    okved_additional=["46.90", "52.10"],
    legal_address="г. Москва, ул. Тверская, д. 1, офис 101",
    registry_status=RegistryStatus.ACTIVE,
    msp_category=MspCategory.SMALL,
    employees_count=42,
    verification=CompanyVerification(source="egrul", verified_at=datetime(2026, 10, 1, 6, 0, tzinfo=UTC)),
)

# with_company — привязать пользователя к COMPANY
SEED_USERS = [
    dict(
        id=uuid.UUID("7f3c2a9e-1b4d-4e8a-9c21-5d6f7a8b9c01"),
        login="owner@test.local",
        password="owner123",
        first_name="Иван",
        middle_name="Петрович",
        birth_date=date(1985, 4, 12),
        role=UserRole.OWNER,
        with_company=True,
    ),
    # вход есть, доступа нет — для проверки страницы «Нет доступа»
    dict(
        id=uuid.UUID("7f3c2a9e-1b4d-4e8a-9c21-5d6f7a8b9c02"),
        login="norole@test.local",
        password="norole123",
        first_name="Пётр",
        middle_name=None,
        birth_date=None,
        role=None,
        with_company=False,
    ),
    dict(
        id=uuid.UUID("7f3c2a9e-1b4d-4e8a-9c21-5d6f7a8b9c03"),
        login="serbelko",
        password="1234",
        first_name="Serbelko",
        middle_name=None,
        birth_date=None,
        role=UserRole.OWNER,
        with_company=True,
    ),
]

# суммы в копейках
COMPANY_ACCOUNTS = [
    dict(type=AccountType.SETTLEMENT, currency="RUB", name="Основной расчётный", is_primary=True, current_money=125_000_000),
    dict(type=AccountType.SETTLEMENT, currency="RUB", name="Для зарплатного проекта", is_primary=False, current_money=8_430_050),
    dict(type=AccountType.DEPOSIT, currency="RUB", name="Депозит «Доходный»", is_primary=False, current_money=500_000_000),
]

USER_ACCOUNTS = [
    dict(type=AccountType.CURRENT, currency="RUB", name="Личный счёт", is_primary=False, current_money=15_420_000),
]

MSK = timezone(timedelta(hours=3))


def msk(value: str) -> datetime:
    return datetime.fromisoformat(value).replace(tzinfo=MSK)


# заявки компании — те же, что в frontend/src/api/demo-applications.ts; суммы в рублях
# (номер, продукт, цель, сумма, срок, одобр. сумма, одобр. срок, статус, действие, создана, изменена)
COMPANY_APPLICATIONS = [
    ("КЗ-2026-001284", "working_capital", "Закупка товара к сезону", 3_000_000, 12, None, None,
     ApplicationStatus.INFO_REQUESTED, "Загрузите выписку по счёту в другом банке за 6 месяцев",
     "2026-10-18T09:12", "2026-10-19T14:40"),
    ("КЗ-2026-001279", "investment", "Покупка фрезерного станка", 8_500_000, 36, 7_000_000, 36,
     ApplicationStatus.COUNTER_OFFER, "Посмотрите предложение банка и примите решение",
     "2026-10-15T11:03", "2026-10-19T10:15"),
    ("КЗ-2026-001301", "express", "Текущие операционные расходы", 500_000, 6, None, None,
     ApplicationStatus.IN_REVIEW, None, "2026-10-20T08:47", "2026-10-20T08:52"),
    ("КЗ-2026-001302", "overdraft", "Кассовые разрывы", 1_200_000, 12, None, None,
     ApplicationStatus.DRAFT, "Заполните сведения о компании и отправьте заявку",
     "2026-10-20T10:05", "2026-10-20T10:05"),
    ("КЗ-2026-001266", "credit_line", "Финансирование контрактов с поставщиками", 15_000_000, 24, 15_000_000, 24,
     ApplicationStatus.APPROVED, "Подтвердите условия, чтобы перейти к подписанию",
     "2026-10-10T16:20", "2026-10-17T12:00"),
    ("КЗ-2026-001250", "working_capital", "Выплата авансов подрядчикам", 2_000_000, 18, 2_000_000, 18,
     ApplicationStatus.SIGNING, "Подпишите кредитный договор", "2026-10-06T13:30", "2026-10-16T09:45"),
    ("КЗ-2026-001298", "express", "Ремонт помещения", 750_000, 12, None, None,
     ApplicationStatus.SUBMITTED, None, "2026-10-19T18:22", "2026-10-19T18:22"),
    ("КЗ-2026-001187", "investment", "Покупка грузового автомобиля", 4_200_000, 48, 4_200_000, 48,
     ApplicationStatus.ISSUED, None, "2026-09-02T10:00", "2026-09-12T15:30"),
    ("КЗ-2026-001203", "credit_line", "Расширение ассортимента", 25_000_000, 36, None, None,
     ApplicationStatus.REJECTED, None, "2026-09-08T12:40", "2026-09-11T17:05"),
    ("КЗ-2026-001145", "overdraft", "Кассовые разрывы", 600_000, 12, 600_000, 12,
     ApplicationStatus.ISSUED, None, "2026-08-21T09:15", "2026-08-23T11:20"),
    ("КЗ-2026-001221", "working_capital", "Закупка сырья", 1_500_000, 9, None, None,
     ApplicationStatus.CANCELLED, None, "2026-09-15T14:00", "2026-09-16T10:30"),
    ("КЗ-2026-001290", "investment", "Модернизация производственной линии", 12_000_000, 60, None, None,
     ApplicationStatus.IN_REVIEW, None, "2026-10-17T15:10", "2026-10-18T09:00"),
]


def make_application(company_id: uuid.UUID, row: tuple) -> Application:
    number, product, purpose, amount, term, approved, approved_term, status, action, created, updated = row
    return Application(
        number=number,
        company_id=company_id,
        product_code=product,
        purpose=purpose,
        currency="RUB",
        requested_amount=amount * 100,
        requested_term_months=term,
        approved_amount=approved * 100 if approved else None,
        approved_term_months=approved_term,
        status=status,
        required_action=action,
        created_at=msk(created),
        updated_at=msk(updated),
    )


async def seed() -> None:
    hasher = get_password_hasher()

    async with SessionFactory() as session:
        companies = CompanyRepository(session)
        users = UserRepository(session)
        accounts = AccountRepository(session)
        applications = ApplicationRepository(session)

        company = await companies.get_by_inn(COMPANY["inn"])
        if company is None:
            company = await companies.add(Company(**COMPANY))
            for data in COMPANY_ACCOUNTS:
                await accounts.add(Account(owner_type=AccountOwnerType.COMPANY, company_id=company.id, **data))
            print(f"created company {company.short_name}")

        for data in SEED_USERS:
            data = dict(data)
            password = data.pop("password")
            company_id = company.id if data.pop("with_company") else None

            user = await users.get_by_login(data["login"])
            if user is None:
                user = await users.add(User(**data, company_id=company_id, password_hash=hasher.hash(password)))
                print(f"created {user.login}")
            elif user.company_id is None and company_id is not None:
                user.company_id = company_id
                print(f"linked {user.login} to company")

            if not await accounts.list_for_owner(user.id, None):
                for account in USER_ACCOUNTS:
                    await accounts.add(Account(owner_type=AccountOwnerType.USER, user_id=user.id, **account))

        created = 0
        for row in COMPANY_APPLICATIONS:
            if await applications.get_by_number(row[0]) is None:
                await applications.add(make_application(company.id, row))
                created += 1
        if created:
            print(f"created {created} applications")

        await session.commit()

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
