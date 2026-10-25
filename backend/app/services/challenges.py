import hashlib
import secrets
import uuid
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ApiError
from app.models import Challenge
from app.services.common import iso, now

TTL = timedelta(minutes=5)
MAX_ATTEMPTS = 5


def hash_code(challenge_id: uuid.UUID, code: str) -> str:
    return hashlib.sha256(f"{challenge_id}:{code}:{settings.jwt_secret}".encode()).hexdigest()


def create(session: AsyncSession, *, subject: str, kind: str, application_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    code = f"{secrets.randbelow(10_000):04d}"
    challenge = Challenge(
        id=uuid.uuid4(),
        subject=subject,
        kind=kind,
        application_id=application_id,
        user_id=user_id,
        expires_at=now() + TTL,
        attempts=0,
    )
    challenge.code_hash = hash_code(challenge.id, code)
    session.add(challenge)
    response = {"challenge_id": str(challenge.id), "expires_at": iso(challenge.expires_at)}
    if settings.demo_mode:
        response["demo_code"] = code
    return response


async def verify(
    session: AsyncSession,
    *,
    challenge_id: str,
    code: str,
    subject: str,
    kind: str | None,
    application_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    try:
        cid = uuid.UUID(str(challenge_id))
    except ValueError:
        cid = None
    challenge = await session.get(Challenge, cid) if cid else None
    if (
        challenge is None
        or challenge.used_at is not None
        or challenge.subject != subject
        or challenge.application_id != application_id
        or challenge.user_id != user_id
        or (kind is not None and challenge.kind != kind)
    ):
        raise ApiError(422, "INVALID_CODE", "Запросите код ещё раз")
    if challenge.expires_at < now():
        raise ApiError(422, "INVALID_CODE", "Срок действия кода истёк, запросите новый")
    if challenge.attempts >= MAX_ATTEMPTS:
        raise ApiError(422, "INVALID_CODE", "Превышено число попыток, запросите новый код")
    if not secrets.compare_digest(challenge.code_hash, hash_code(challenge.id, str(code).strip())):
        challenge.attempts += 1
        left = MAX_ATTEMPTS - challenge.attempts
        await session.commit()
        raise ApiError(422, "INVALID_CODE", "Неверный код", {"attempts_left": left})
    challenge.used_at = now()
