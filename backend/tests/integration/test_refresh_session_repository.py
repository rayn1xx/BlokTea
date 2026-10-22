import asyncio
import uuid
from datetime import timedelta

import pytest
from redis.asyncio import Redis

from app.db.repositories import ConsumeStatus, RefreshSessionRepository
from app.db.repositories.refresh_session import SESSION_KEY, USER_SESSIONS_KEY

TTL = timedelta(days=30)


@pytest.fixture
def repo(redis: Redis) -> RefreshSessionRepository:
    return RefreshSessionRepository(redis)


async def test_add_stores_session_with_ttl(repo: RefreshSessionRepository, redis: Redis) -> None:
    user_id = uuid.uuid4()

    await repo.add("hash-1", user_id, TTL)

    assert await redis.hgetall(SESSION_KEY.format("hash-1")) == {"user_id": str(user_id), "revoked": "0"}
    assert await redis.smembers(USER_SESSIONS_KEY.format(user_id)) == {"hash-1"}
    for key in (SESSION_KEY.format("hash-1"), USER_SESSIONS_KEY.format(user_id)):
        assert TTL.total_seconds() - 5 < await redis.ttl(key) <= TTL.total_seconds()


async def test_consume_once_then_reused(repo: RefreshSessionRepository, redis: Redis) -> None:
    user_id = uuid.uuid4()
    await repo.add("hash-1", user_id, TTL)

    first = await repo.consume("hash-1")
    second = await repo.consume("hash-1")

    assert (first.status, first.user_id) == (ConsumeStatus.OK, user_id)
    assert (second.status, second.user_id) == (ConsumeStatus.REUSED, user_id)
    # использованный токен остаётся до конца TTL: чтобы распознать повторное использование
    assert await redis.ttl(SESSION_KEY.format("hash-1")) > 0


async def test_consume_missing(repo: RefreshSessionRepository) -> None:
    result = await repo.consume("unknown")

    assert (result.status, result.user_id) == (ConsumeStatus.MISSING, None)


async def test_session_expires_by_ttl(repo: RefreshSessionRepository) -> None:
    await repo.add("hash-1", uuid.uuid4(), timedelta(seconds=1))

    await asyncio.sleep(1.2)

    assert (await repo.consume("hash-1")).status is ConsumeStatus.MISSING


async def test_concurrent_consume_succeeds_only_once(repo: RefreshSessionRepository) -> None:
    await repo.add("hash-1", uuid.uuid4(), TTL)

    results = await asyncio.gather(*(repo.consume("hash-1") for _ in range(20)))

    statuses = [r.status for r in results]
    assert statuses.count(ConsumeStatus.OK) == 1
    assert statuses.count(ConsumeStatus.REUSED) == 19


async def test_delete_removes_session_and_index(repo: RefreshSessionRepository, redis: Redis) -> None:
    user_id = uuid.uuid4()
    await repo.add("hash-1", user_id, TTL)
    await repo.add("hash-2", user_id, TTL)

    await repo.delete("hash-1")

    assert not await redis.exists(SESSION_KEY.format("hash-1"))
    assert await redis.smembers(USER_SESSIONS_KEY.format(user_id)) == {"hash-2"}


async def test_delete_unknown_is_noop(repo: RefreshSessionRepository) -> None:
    await repo.delete("unknown")


async def test_revoke_all_only_for_given_user(repo: RefreshSessionRepository, redis: Redis) -> None:
    victim, other = uuid.uuid4(), uuid.uuid4()
    await repo.add("victim-1", victim, TTL)
    await repo.add("victim-2", victim, TTL)
    await repo.add("other-1", other, TTL)

    await repo.revoke_all_for_user(victim)

    assert (await repo.consume("victim-1")).status is ConsumeStatus.MISSING
    assert (await repo.consume("victim-2")).status is ConsumeStatus.MISSING
    assert not await redis.exists(USER_SESSIONS_KEY.format(victim))
    assert (await repo.consume("other-1")).status is ConsumeStatus.OK


async def test_revoke_all_without_sessions_is_noop(repo: RefreshSessionRepository) -> None:
    await repo.revoke_all_for_user(uuid.uuid4())
