"""Демо-данные (раздел 6 ТЗ): python -m app.seed: создать, если базы ещё нет; --reset: вернуть к началу показа.

Числа согласованы с моками (backend/mocks/data.py): поступления 2 100 000 ₽, расходы 1 450 000 ₽, платежи по
кредитам 118 400 ₽ в месяц. Все люди и компании вымышлены.
"""

import argparse
import asyncio
import shutil
import uuid
from datetime import UTC, date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select, text

from app.api.deps import get_password_hasher
from app.core.config import settings
from app.db.session import SessionFactory, engine
from app.domain.catalog import DEFAULT_PERMISSIONS, rub
from app.domain.finance import monthly_payment, overpayment
from app.models import (
    Account,
    AccountOwnerType,
    AccountType,
    Application,
    ApplicationEvent,
    ApplicationStatus,
    BankRole,
    Base,
    Company,
    CompanyProfile,
    CompanyVerification,
    Decision,
    Document,
    FeedItem,
    LegalForm,
    Member,
    MemberStatus,
    MspCategory,
    Notification,
    RegistryStatus,
    SigningRules,
    SigningSession,
    Task,
    User,
    UserRole,
)
from app.services.team import hash_invite
from mocks.main import simple_pdf

MSK = timezone(timedelta(hours=3))
DEMO_PASSWORD = "alfa2026"
INVITE_CODE = "4821-KX"
# справочники, которые заполняет миграция, и служебная таблица alembic
KEEP_TABLES = {"credit_products"}


def msk(value: str) -> datetime:
    return datetime.fromisoformat(value).replace(tzinfo=MSK)


def uid(n: int) -> uuid.UUID:
    return uuid.UUID(f"00000000-0000-4000-8000-{n:012d}")


MASHPROM = uid(1)
ORLOVA_IP = uid(2)

U_SMIRNOV, U_PETROV, U_MALKINA, U_LES, U_ORLOVA, U_ANALYST, U_ADMIN, U_NOROLE, U_SERBELKO = (
    uid(100 + i) for i in range(9)
)

USERS = [
    # id, логин, фамилия, имя, отчество, дата рождения, роль в банке, пароль
    (U_SMIRNOV, "petr.smirnov@test.local", "Смирнов", "Пётр", "Иванович", date(1978, 5, 14), None, DEMO_PASSWORD),
    (U_PETROV, "sergey.petrov@test.local", "Петров", "Сергей", "Александрович", date(1981, 9, 2), None, DEMO_PASSWORD),
    (U_MALKINA, "anna.malkina@test.local", "Малькина", "Анна", "Викторовна", date(1988, 1, 23), None, DEMO_PASSWORD),
    (U_LES, "irina.les@test.local", "Лес", "Ирина", "Олеговна", date(1992, 11, 30), None, DEMO_PASSWORD),
    (U_ORLOVA, "maria.orlova@test.local", "Орлова", "Мария", "Сергеевна", date(1990, 3, 8), None, DEMO_PASSWORD),
    (U_ANALYST, "analyst@test.local", "Кузнецова", "Елена", "Павловна", None, BankRole.UNDERWRITER, DEMO_PASSWORD),
    (U_ADMIN, "bank.admin@test.local", "Захаров", "Олег", "Игоревич", None, BankRole.BANK_ADMIN, DEMO_PASSWORD),
    # вход есть, роли в компании нет: экран «Нет доступа к компании»
    (U_NOROLE, "no.role@test.local", "Гусев", "Антон", None, None, None, DEMO_PASSWORD),
    # учётка разработчика из прежнего seed
    (U_SERBELKO, "serbelko", "Сербелько", "Разработчик", None, None, None, "1234"),
]

COMPANIES = [
    dict(
        id=MASHPROM,
        legal_form=LegalForm.OOO,
        inn="7700000001",
        ogrn="1150000000001",
        kpp="770001001",
        full_name="Общество с ограниченной ответственностью «Машпромхоз»",
        short_name="ООО «Машпромхоз»",
        registration_date=date(2015, 3, 12),
        okved_main="25.62 Обработка металлических изделий механическая",
        okved_additional=[
            "25.11 Производство строительных металлических конструкций",
            "33.12 Ремонт машин и оборудования",
        ],
        legal_address="г. Москва, ул. Заводская, д. 7, стр. 2",
        registry_status=RegistryStatus.ACTIVE,
        msp_category=MspCategory.MICRO,
        employees_count=18,
        director_user_id=U_SMIRNOV,
        verification=CompanyVerification(source="ЕГРЮЛ", verified_at=msk("2026-10-20T09:00:00")),
    ),
    dict(
        id=ORLOVA_IP,
        legal_form=LegalForm.IP,
        inn="770000000012",
        ogrn="318500000000002",
        kpp=None,
        full_name="Индивидуальный предприниматель Орлова Мария Сергеевна",
        short_name="ИП Орлова М. С.",
        registration_date=date(2018, 6, 4),
        okved_main="56.10 Деятельность ресторанов и услуги по доставке продуктов питания",
        okved_additional=["47.24 Торговля розничная хлебом и кондитерскими изделиями"],
        legal_address="Московская обл., г. Химки, ул. Лесная, д. 3",
        registry_status=RegistryStatus.ACTIVE,
        msp_category=MspCategory.MICRO,
        employees_count=6,
        director_user_id=U_ORLOVA,
        verification=CompanyVerification(source="ЕГРИП", verified_at=msk("2026-10-19T09:00:00")),
    ),
]

MEMBERS = [
    # компания, пользователь, роль, фамилия, имя, отчество, логин
    (MASHPROM, U_SMIRNOV, UserRole.OWNER, "Смирнов", "Пётр", "Иванович", "petr.smirnov@test.local"),
    (MASHPROM, U_PETROV, UserRole.OWNER, "Петров", "Сергей", "Александрович", "sergey.petrov@test.local"),
    (MASHPROM, U_MALKINA, UserRole.CFO_OR_ACCOUNTANT, "Малькина", "Анна", "Викторовна", "anna.malkina@test.local"),
    (MASHPROM, U_LES, UserRole.FINANCING_EMPLOYEE, "Лес", "Ирина", "Олеговна", "irina.les@test.local"),
    (MASHPROM, U_SERBELKO, UserRole.OWNER, "Сербелько", "Разработчик", None, "serbelko"),
    (ORLOVA_IP, U_ORLOVA, UserRole.OWNER, "Орлова", "Мария", "Сергеевна", "maria.orlova@test.local"),
]

SIGNING_RULES = {
    MASHPROM: {
        "can_send_to_signing": ["owner", "director", "financing_employee"],
        "signers": [
            {"order": 1, "document": "contract", "user_id": str(U_SMIRNOV), "role": None, "required": True},
            {"order": 2, "document": "surety", "user_id": str(U_PETROV), "role": "owner", "required": True},
        ],
    },
    ORLOVA_IP: {
        "can_send_to_signing": ["owner"],
        "signers": [{"order": 1, "document": "contract", "user_id": None, "role": "owner", "required": True}],
    },
}

FEED = [
    (
        "program",
        "Льготные кредиты для обрабатывающих производств",
        "Программа поддержки снижает ставку для компаний с ОКВЭД раздела C. Деньги можно направить на оборудование "
        "и пополнение оборотных средств.",
        "2026-10-18T10:00:00",
        ["господдержка", "производство"],
        {"label": "Посмотреть продукт", "route": "/products/gov_program"},
        {"legal_forms": ["OOO"], "okved_prefixes": ["10", "13", "16", "22", "24", "25", "28", "33"]},
    ),
    (
        "tip",
        "Как спад в январе и феврале влияет на кредит",
        "Если поступления в начале года ниже, банк смотрит на средние обороты. Срок подлиннее снижает платёж "
        "в слабые месяцы.",
        "2026-10-15T12:00:00",
        ["совет", "сезонность"],
        {"label": "Подобрать кредит", "route": "/home"},
        {"seasonality": True},
    ),
    (
        "industry",
        "Цены на металлопрокат: что ждать в ноябре",
        "Поставщики предупреждают о росте цен на 3-5%. Закупку сырья к концу года стоит планировать заранее.",
        "2026-10-12T09:30:00",
        ["отрасль"],
        None,
        {"okved_prefixes": ["24", "25"]},
    ),
    (
        "tip",
        "Отчётность за 2025 год увеличит сумму кредита",
        "Бухгалтерская отчётность подтверждает выручку. С ней банк может одобрить сумму больше, а решение примет быстрее.",
        "2026-10-08T10:00:00",
        ["совет", "документы"],
        {"label": "Загрузить", "route": "/documents"},
        {"readiness_warning": "documents"},
    ),
    (
        "product_update",
        "Овердрафт теперь до 5 000 000 ₽",
        "Лимит овердрафта для микропредприятий увеличен. Заявку можно подать прямо в кабинете.",
        "2026-10-05T11:00:00",
        ["продукт"],
        {"label": "Подробнее", "route": "/products/overdraft"},
        {"product_code": "overdraft"},
    ),
    (
        "tip",
        "Кредит для ИП на патенте: какие документы нужны",
        "Для ИП на патенте банк смотрит обороты по счёту и патент. Отчётность как у ООО не нужна.",
        "2026-10-17T10:00:00",
        ["ИП", "документы"],
        {"label": "Готовые варианты", "route": "/products"},
        {"legal_forms": ["IP"], "reason": "вы ИП, документы для ИП отличаются от ООО"},
    ),
    (
        "program",
        "Поддержка общепита в Московской области",
        "Региональная программа компенсирует часть ставки по кредитам на оборудование для кафе и ресторанов.",
        "2026-10-10T10:00:00",
        ["господдержка", "общепит"],
        None,
        {"okved_prefixes": ["56"]},
    ),
    (
        "product_update",
        "Экспресс-кредит без визита в банк",
        "Сумма до 1 000 000 ₽, предварительное решение за 15 минут.",
        "2026-10-02T10:00:00",
        ["продукт"],
        {"label": "Подробнее", "route": "/products/express"},
        {"product_code": "express"},
    ),
]


def event(
    app_id: uuid.UUID,
    at: str,
    from_status: str | None,
    to_status: str,
    title: str,
    actor_type: str,
    actor_name: str | None = None,
    description: str | None = None,
    actor_id: uuid.UUID | None = None,
) -> ApplicationEvent:
    return ApplicationEvent(
        application_id=app_id,
        at=msk(at),
        from_status=from_status,
        to_status=to_status,
        title=title,
        actor_type=actor_type,
        actor_name=actor_name,
        actor_id=actor_id,
        description=description,
        payload={},
    )


def application(
    n: int,
    company: uuid.UUID,
    number: str,
    status: ApplicationStatus,
    product: str,
    purpose_code: str,
    purpose: str,
    amount: int,
    term: int,
    rate: float,
    created_by: uuid.UUID,
    created: str,
    updated: str,
    **extra,
) -> Application:
    data = dict(version=3, form_step="review", form_data={}, form_saved_at=msk(created)) | extra
    return Application(
        id=uid(1000 + n),
        number=number,
        company_id=company,
        created_by=created_by,
        product_code=product,
        purpose_code=purpose_code,
        purpose=purpose,
        currency="RUB",
        requested_amount=rub(amount),
        requested_term_months=term,
        rate_percent=rate,
        status=status,
        created_at=msk(created),
        updated_at=msk(updated),
        **data,
    )


def decision_payload(
    app: Application,
    kind: str,
    decided_at: str,
    factors: list[dict],
    explanation: str,
    tips: list[str],
    valid_until: str | None,
) -> dict:
    offered = None
    if kind != "rejected":
        amount, term, rate = app.approved_amount, app.approved_term_months, float(app.rate_percent)
        from app.services.application_view import product_ref

        offered = {
            "product": product_ref(app.product_code),
            "amount": {"value": amount, "currency": "RUB"},
            "term_months": term,
            "rate_percent": rate,
            "monthly_payment": {"value": monthly_payment(app.product_code, amount, term, rate), "currency": "RUB"},
            "overpayment": {"value": overpayment(app.product_code, amount, term, rate), "currency": "RUB"},
        }
    return {
        "type": kind,
        "decided_at": msk(decided_at).isoformat(),
        "decided_by": "underwriter",
        "requested": {
            "amount": {"value": app.requested_amount, "currency": "RUB"},
            "term_months": app.requested_term_months,
        },
        "offered": offered,
        "offer_valid_until": valid_until,
        "factors": factors,
        "explanation_text": explanation,
        "improve_tips": tips,
        "text_source": "template",
    }


def store_pdf(company_id: uuid.UUID, doc_id: uuid.UUID, lines: list[str]) -> tuple[str, int]:
    directory = Path(settings.upload_dir) / str(company_id)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{doc_id}_v1"
    content = simple_pdf(lines)
    path.write_bytes(content)
    return str(path), len(content)


async def reset(session) -> None:
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables if t.name not in KEEP_TABLES)
    await session.execute(text(f"TRUNCATE {tables} CASCADE"))
    await session.execute(text("ALTER SEQUENCE application_number_seq RESTART WITH 1044"))
    shutil.rmtree(settings.upload_dir, ignore_errors=True)


async def seed(session) -> None:
    hasher = get_password_hasher()
    # пользователи, которые уже есть в базе (например, из прежнего seed), не пересоздаём
    existing = {u.login: u.id for u in await session.scalars(select(User).where(User.login.in_([u[1] for u in USERS])))}
    user_ids = {}
    # у демо-учёток один пароль: хешируем его один раз (соль в хеше всё равно своя у каждого хеша)
    hashes = {password: hasher.hash(password) for *_, password in USERS}
    for user_id, login, last, first, middle, birth, bank_role, password in USERS:
        user_ids[user_id] = existing.get(login, user_id)
        if login not in existing:
            session.add(
                User(
                    id=user_id,
                    login=login,
                    password_hash=hashes[password],
                    last_name=last,
                    first_name=first,
                    middle_name=middle,
                    birth_date=birth,
                    bank_role=bank_role,
                    is_active=True,
                )
            )
    await session.flush()

    for data in COMPANIES:
        session.add(Company(**data))
    await session.flush()

    for i, (company, user, role, last, first, middle, login) in enumerate(MEMBERS):
        session.add(
            Member(
                company_id=company,
                user_id=user_ids[user],
                role=role,
                permissions=DEFAULT_PERMISSIONS[role.value],
                status=MemberStatus.ACTIVE,
                has_alfa_business_access=True,
                last_name=last,
                first_name=first,
                middle_name=middle,
                login=login,
                created_at=msk("2024-02-01T10:00:00") + timedelta(minutes=i),
            )
        )
    # приглашение из раздела 6: код 4821-KX для «Котов Олег»
    session.add(
        Member(
            company_id=MASHPROM,
            user_id=None,
            role=UserRole.BANKING_EMPLOYEE,
            permissions=DEFAULT_PERMISSIONS["banking_employee"],
            status=MemberStatus.INVITED,
            has_alfa_business_access=False,
            last_name="Котов",
            first_name="Олег",
            middle_name="Андреевич",
            login="oleg.kotov@test.local",
            invite_code_hash=hash_invite(INVITE_CODE),
            invite_expires_at=msk("2026-11-30T23:59:00"),
            created_at=msk("2026-10-20T12:00:00"),
        )
    )

    session.add(
        CompanyProfile(
            company_id=MASHPROM,
            registry_confirmed=False,
            client_input={},
            completeness_percent=60,
            onboarding_completed=False,
        )
    )
    session.add(
        CompanyProfile(
            company_id=ORLOVA_IP,
            registry_confirmed=True,
            client_input={},
            completeness_percent=100,
            onboarding_completed=True,
        )
    )
    for company, rules in SIGNING_RULES.items():
        session.add(SigningRules(company_id=company, rules=rules, version=1))

    session.add(
        Account(
            owner_type=AccountOwnerType.COMPANY,
            company_id=MASHPROM,
            type=AccountType.SETTLEMENT,
            currency="RUB",
            name="Расчётный счёт •••• 4512",
            is_primary=True,
            current_money=rub(1_842_500),
        )
    )
    session.add(
        Account(
            owner_type=AccountOwnerType.COMPANY,
            company_id=ORLOVA_IP,
            type=AccountType.SETTLEMENT,
            currency="RUB",
            name="Расчётный счёт •••• 7731",
            is_primary=True,
            current_money=rub(413_000),
        )
    )

    # документы компании: устав принят, решение о директоре истекает 31.03, выписка другого банка отклонена
    docs = [
        (
            uid(2001),
            "charter",
            "Устав",
            "ustav_mashpromhoz.pdf",
            "accepted",
            None,
            None,
            "2026-06-10T12:00:00",
            "alfa_lk",
        ),
        (
            uid(2002),
            "director_decision",
            "Решение о назначении директора",
            "reshenie_direktor.pdf",
            "accepted",
            None,
            date(2027, 3, 31),
            "2026-06-10T12:05:00",
            "alfa_lk",
        ),
        (
            uid(2003),
            "other_bank_statements",
            "Выписка по счёту в другом банке",
            "vypiska_drugoy_bank.pdf",
            "rejected",
            "Выписка старше 6 месяцев, загрузите свежую",
            None,
            "2026-03-15T15:00:00",
            "upload",
        ),
    ]
    for doc_id, doc_type, title, file_name, status, reason, expires, uploaded, origin in docs:
        path, size = store_pdf(
            MASHPROM,
            doc_id,
            [title.encode("ascii", "ignore").decode() or doc_type, "INN 7700000001", "Synthetic demo document"],
        )
        session.add(
            Document(
                id=doc_id,
                company_id=MASHPROM,
                document_type=doc_type,
                title=title,
                scope="application" if doc_type == "other_bank_statements" else "company",
                origin=origin,
                file_path=path,
                file_name=file_name,
                content_type="application/pdf",
                size_bytes=size,
                version=1,
                status=status,
                status_reason=reason,
                expires_at=expires,
                uploaded_by=U_SMIRNOV if origin == "upload" else None,
                uploaded_at=msk(uploaded),
            )
        )

    await seed_applications(session)

    for kind, title, body, published, tags, cta, targeting in FEED:
        session.add(
            FeedItem(
                type=kind, title=title, body=body, published_at=msk(published), tags=tags, cta=cta, targeting=targeting
            )
        )

    session.add(
        Notification(
            user_id=U_SMIRNOV,
            created_at=msk("2026-10-21T09:00:00"),
            read=False,
            title="Предодобренный лимит 1 200 000 ₽",
            text="Можно оформить до 30 ноября без подтверждения цели",
            route="/home",
        )
    )


async def seed_applications(session) -> None:
    draft = application(
        1,
        MASHPROM,
        "КЗ-2026-001037",
        ApplicationStatus.DRAFT,
        "overdraft",
        "current_expenses",
        "Кассовые разрывы",
        600_000,
        12,
        17.0,
        U_LES,
        "2026-10-14T11:20:00",
        "2026-10-14T11:20:00",
        version=1,
        form_step="params",
    )
    review = application(
        2,
        MASHPROM,
        "КЗ-2026-001039",
        ApplicationStatus.IN_REVIEW,
        "working_capital",
        "working_capital",
        "Закупка металлопроката к сезону",
        800_000,
        18,
        15.0,
        U_SMIRNOV,
        "2026-10-19T10:00:00",
        "2026-10-19T10:06:00",
        queued_at=msk("2026-10-19T10:06:00"),
        load_at_submit=None,
    )
    signing = application(
        3,
        MASHPROM,
        "КЗ-2026-001040",
        ApplicationStatus.SIGNING,
        "working_capital",
        "working_capital",
        "Пополнение оборотных средств",
        1_000_000,
        24,
        15.0,
        U_SMIRNOV,
        "2026-10-15T09:30:00",
        "2026-10-20T16:10:00",
        approved_amount=rub(1_000_000),
        approved_term_months=24,
        bank_assignee_id=U_ANALYST,
    )
    rejected = application(
        4,
        MASHPROM,
        "КЗ-2026-001029",
        ApplicationStatus.REJECTED,
        "credit_line",
        "gov_contract",
        "Исполнение госконтракта",
        5_000_000,
        24,
        15.5,
        U_SMIRNOV,
        "2026-09-02T10:00:00",
        "2026-09-05T16:00:00",
        bank_assignee_id=U_ANALYST,
    )
    cancelled = application(
        5,
        MASHPROM,
        "КЗ-2026-001018",
        ApplicationStatus.CANCELLED,
        "express",
        "repair",
        "Ремонт цеха",
        400_000,
        12,
        19.0,
        U_SMIRNOV,
        "2026-08-11T10:00:00",
        "2026-08-12T09:00:00",
    )
    # выданный кредит виден в Альфа-Бизнесе как alfa-loan-1, поэтому отдельный Loan не создаём
    issued = application(
        6,
        MASHPROM,
        "КЗ-2025-000412",
        ApplicationStatus.ISSUED,
        "any_purpose",
        "other",
        "Покупка сырья и расходники",
        500_000,
        18,
        16.5,
        U_SMIRNOV,
        "2025-05-12T10:00:00",
        "2025-05-20T12:00:00",
        approved_amount=rub(500_000),
        approved_term_months=18,
        bank_assignee_id=U_ANALYST,
    )
    orlova = application(
        7,
        ORLOVA_IP,
        "КЗ-2026-001041",
        ApplicationStatus.IN_REVIEW,
        "investment",
        "equipment",
        "Печь для пекарни",
        900_000,
        24,
        14.5,
        U_ORLOVA,
        "2026-10-20T15:10:00",
        "2026-10-20T15:12:00",
        queued_at=msk("2026-10-20T15:12:00"),
    )
    apps = [draft, review, signing, rejected, cancelled, issued, orlova]
    session.add_all(apps)
    await session.flush()

    session.add(
        event(draft.id, "2026-10-14T11:20:00", None, "draft", "Заявка создана", "client", "Лес И. О.", actor_id=U_LES)
    )
    for app, at_sub, at_rev in (
        (review, "2026-10-19T10:05:00", "2026-10-19T10:06:00"),
        (orlova, "2026-10-20T15:11:00", "2026-10-20T15:12:00"),
    ):
        session.add(
            event(app.id, app.created_at.astimezone(MSK).isoformat()[:19], None, "draft", "Заявка создана", "client")
        )
        session.add(event(app.id, at_sub, "draft", "submitted", "Заявка отправлена в банк", "client"))
        session.add(
            event(
                app.id,
                at_rev,
                "submitted",
                "in_review",
                "Проверка данных",
                "system",
                description="Автопроверки: реестр, БКИ, обороты, ФНС, нагрузка",
            )
        )

    approved_payload = decision_payload(
        signing,
        "approved",
        "2026-10-17T14:00:00",
        [
            {
                "code": "business_age",
                "title": "Срок работы бизнеса",
                "impact": "positive",
                "text": "Компания давно работает, это повышает доверие",
            },
            {
                "code": "credit_history",
                "title": "Кредитная история",
                "impact": "positive",
                "text": "Вы платите по кредитам вовремя",
            },
            {
                "code": "debt_load",
                "title": "Долговая нагрузка",
                "impact": "neutral",
                "text": "Платежи по кредитам укладываются в свободный денежный поток почти без запаса",
            },
        ],
        "Банк готов выдать 1 000 000 ₽ на 24 мес",
        [],
        "2026-10-31",
    )
    session.add(
        Decision(
            application_id=signing.id,
            type="approved",
            decided_by="underwriter",
            decided_by_user_id=U_ANALYST,
            text_source="template",
            payload=approved_payload,
            created_at=msk("2026-10-17T14:00:00"),
        )
    )
    for at, frm, to, title, actor, name in (
        ("2026-10-15T09:30:00", None, "draft", "Заявка создана", "client", "Смирнов П. И."),
        ("2026-10-15T09:50:00", "draft", "submitted", "Заявка отправлена в банк", "client", "Смирнов П. И."),
        ("2026-10-15T09:51:00", "submitted", "in_review", "Проверка данных", "system", None),
        ("2026-10-17T14:00:00", "in_review", "approved", "Заявка одобрена", "bank", None),
        ("2026-10-20T16:10:00", "approved", "signing", "Предложение принято", "client", "Смирнов П. И."),
    ):
        session.add(event(signing.id, at, frm, to, title, actor, name))
    session.add(
        SigningSession(
            application_id=signing.id,
            status="active",
            rules_version=1,
            created_at=msk("2026-10-20T16:10:00"),
            signers=[
                {
                    "order": 1,
                    "user_id": str(U_SMIRNOV),
                    "document": "contract",
                    "required": True,
                    "status": "pending",
                    "signed_at": None,
                },
                {
                    "order": 2,
                    "user_id": str(U_PETROV),
                    "document": "surety",
                    "required": True,
                    "status": "waiting",
                    "signed_at": None,
                },
            ],
        )
    )
    session.add(
        Task(
            company_id=MASHPROM,
            type="sign",
            application_id=signing.id,
            assignee_user_id=U_SMIRNOV,
            ref_id=str(U_SMIRNOV),
            status="open",
            title="Подписать кредитный договор по заявке КЗ-2026-001040",
            cta={"label": "Подписать", "route": f"/applications/{signing.id}/signing"},
            created_at=msk("2026-10-20T16:10:00"),
        )
    )
    session.add(
        Notification(
            user_id=U_SMIRNOV,
            created_at=msk("2026-10-20T16:10:00"),
            read=False,
            title="Подпишите документы по заявке КЗ-2026-001040",
            text="Код подтверждения появится в кабинете",
            application_id=signing.id,
            route=f"/applications/{signing.id}/signing",
        )
    )

    rejected_payload = decision_payload(
        rejected,
        "rejected",
        "2026-09-05T16:00:00",
        [
            {
                "code": "debt_load",
                "title": "Долговая нагрузка",
                "impact": "negative",
                "text": "Платежи по всем кредитам заняли бы больше половины свободного денежного потока",
            },
            {
                "code": "business_age",
                "title": "Срок работы бизнеса",
                "impact": "positive",
                "text": "Компания давно работает",
            },
        ],
        "Сейчас не можем выдать кредит. Что повлияло: долговая нагрузка",
        ["Уменьшите сумму или увеличьте срок, чтобы платёж был меньше", "Погасите часть текущих кредитов"],
        None,
    )
    session.add(
        Decision(
            application_id=rejected.id,
            type="rejected",
            decided_by="underwriter",
            decided_by_user_id=U_ANALYST,
            text_source="template",
            payload=rejected_payload,
            created_at=msk("2026-09-05T16:00:00"),
        )
    )
    for at, frm, to, title, actor in (
        ("2026-09-02T10:00:00", None, "draft", "Заявка создана", "client"),
        ("2026-09-02T10:20:00", "draft", "submitted", "Заявка отправлена в банк", "client"),
        ("2026-09-02T10:21:00", "submitted", "in_review", "Проверка данных", "system"),
        ("2026-09-05T16:00:00", "in_review", "rejected", "Решение банка", "bank"),
    ):
        session.add(event(rejected.id, at, frm, to, title, actor))
    for at, frm, to, title, actor in (
        ("2026-08-11T10:00:00", None, "draft", "Заявка создана", "client"),
        ("2026-08-12T09:00:00", "draft", "cancelled", "Заявка отозвана", "client"),
    ):
        session.add(event(cancelled.id, at, frm, to, title, actor))
    for at, frm, to, title, actor in (
        ("2025-05-12T10:00:00", None, "draft", "Заявка создана", "client"),
        ("2025-05-12T10:30:00", "draft", "submitted", "Заявка отправлена в банк", "client"),
        ("2025-05-12T10:31:00", "submitted", "in_review", "Проверка данных", "system"),
        ("2025-05-14T11:00:00", "in_review", "approved", "Заявка одобрена", "bank"),
        ("2025-05-15T10:00:00", "approved", "signing", "Предложение принято", "client"),
        ("2025-05-20T12:00:00", "signing", "issued", "Кредит выдан", "system"),
    ):
        session.add(event(issued.id, at, frm, to, title, actor))


async def main(force_reset: bool) -> None:
    async with SessionFactory() as session:
        if force_reset:
            await reset(session)
        elif await session.scalar(select(Company).where(Company.inn == "7700000001")):
            print("demo data already exists, use --reset to recreate")
            await engine.dispose()
            return
        await seed(session)
        await session.commit()
        print(f"demo data seeded at {datetime.now(UTC).isoformat(timespec='seconds')}")
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Демо-данные кредитного кабинета")
    parser.add_argument("--reset", action="store_true", help="очистить базу и создать демо-данные заново")
    args = parser.parse_args()
    if not settings.seed_demo and not args.reset:
        print("SEED_DEMO=false, skip")
    else:
        asyncio.run(main(args.reset))
