import uuid
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.repositories import CompanyRepository, UserRepository
from app.models import Company, CompanyVerification, LegalForm, Member, MspCategory, RegistryStatus
from tests.factories import digits, make_company, make_member, make_user


@pytest.fixture
def repo(db_session: AsyncSession) -> CompanyRepository:
    return CompanyRepository(db_session)


async def reload(session_factory: async_sessionmaker[AsyncSession], company_id: uuid.UUID) -> Company | None:
    async with session_factory() as other:
        return await CompanyRepository(other).get_by_id(company_id)


async def test_roundtrip_keeps_all_fields(
    repo: CompanyRepository, db_session: AsyncSession, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    company = await repo.add(make_company(okved_additional=["46.90", "52.10"], msp_category=MspCategory.SMALL))
    await db_session.commit()

    loaded = await reload(session_factory, company.id)

    assert loaded is not None
    assert loaded.inn == company.inn
    assert loaded.legal_form is LegalForm.OOO
    assert loaded.registry_status is RegistryStatus.ACTIVE
    assert loaded.msp_category is MspCategory.SMALL
    assert loaded.okved_additional == ["46.90", "52.10"]
    assert loaded.verification == company.verification
    assert isinstance(loaded.verification, CompanyVerification)
    assert loaded.created_at is not None


async def test_defaults(
    repo: CompanyRepository, db_session: AsyncSession, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    template = make_company()
    company = Company(
        legal_form=template.legal_form,
        inn=template.inn,
        ogrn=template.ogrn,
        kpp=template.kpp,
        full_name=template.full_name,
        short_name=template.short_name,
        registration_date=template.registration_date,
        okved_main=template.okved_main,
        legal_address=template.legal_address,
        verification=template.verification,
    )
    await repo.add(company)
    await db_session.commit()

    loaded = await reload(session_factory, company.id)

    assert loaded is not None
    assert loaded.okved_additional == []
    assert loaded.registry_status is RegistryStatus.ACTIVE
    assert loaded.msp_category is None
    assert loaded.employees_count is None


async def test_individual_entrepreneur(repo: CompanyRepository) -> None:
    company = await repo.add(make_company(legal_form=LegalForm.IP))

    assert company.kpp is None


async def test_get_by_inn(repo: CompanyRepository) -> None:
    company = await repo.add(make_company())

    assert (await repo.get_by_inn(company.inn)) is company
    assert await repo.get_by_inn("0000000000") is None


async def test_get_missing_returns_none(repo: CompanyRepository) -> None:
    assert await repo.get_by_id(uuid.uuid4()) is None


@pytest.mark.parametrize("field", ["inn", "ogrn"])
async def test_requisites_are_unique(repo: CompanyRepository, field: str) -> None:
    existing = await repo.add(make_company())

    with pytest.raises(IntegrityError):
        await repo.add(make_company(**{field: getattr(existing, field)}))


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"inn": "77012345"}, id="inn-too-short"),
        pytest.param({"inn": "77012345AB"}, id="inn-letters"),
        pytest.param({"inn": digits(12)}, id="ooo-with-12-digit-inn"),
        pytest.param({"ogrn": digits(15)}, id="ooo-with-15-digit-ogrn"),
        pytest.param({"ogrn": "12345"}, id="ogrn-too-short"),
        pytest.param({"kpp": None}, id="ooo-without-kpp"),
        pytest.param({"kpp": "77010100"}, id="kpp-too-short"),
        pytest.param({"kpp": "7701ab001"}, id="kpp-lowercase-letters"),
        pytest.param({"employees_count": -1}, id="negative-employees"),
        pytest.param(
            {"legal_form": LegalForm.IP, "inn": digits(12), "ogrn": digits(15), "kpp": "770101001"},
            id="ip-with-kpp",
        ),
        pytest.param(
            {"legal_form": LegalForm.IP, "inn": digits(10), "ogrn": digits(15), "kpp": None},
            id="ip-with-10-digit-inn",
        ),
    ],
)
async def test_invalid_requisites_rejected(repo: CompanyRepository, overrides: dict[str, Any]) -> None:
    with pytest.raises(IntegrityError):
        await repo.add(make_company(**overrides))


async def test_kpp_with_latin_letters_allowed(repo: CompanyRepository) -> None:
    await repo.add(make_company(kpp="7701AB001"))


async def test_deleting_company_removes_members_but_keeps_users(
    repo: CompanyRepository, db_session: AsyncSession, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    company = await repo.add(make_company())
    user = await UserRepository(db_session).add(make_user())
    db_session.add(make_member(company=company, user=user))
    await db_session.commit()

    await db_session.delete(company)
    await db_session.commit()

    async with session_factory() as other:
        loaded = await UserRepository(other).get_by_id(user.id)
        members = await other.scalar(select(func.count()).select_from(Member).where(Member.user_id == user.id))
    assert loaded is not None
    assert members == 0
