import uuid
from dataclasses import dataclass
from datetime import timedelta
from enum import StrEnum

from redis.asyncio import Redis

# auth:refresh:{token_hash} -> hash {user_id, revoked}; живёт столько же, сколько refresh-токен
# auth:user_refresh:{user_id} -> set хешей токенов пользователя, чтобы отозвать все сессии разом
SESSION_KEY = "auth:refresh:{}"
USER_SESSIONS_KEY = "auth:user_refresh:{}"

# проверка и пометка «использован» одной атомарной операцией: два параллельных refresh не пройдут оба
CONSUME_SCRIPT = """
local user_id = redis.call('HGET', KEYS[1], 'user_id')
if not user_id then
    return {'missing'}
end
if redis.call('HGET', KEYS[1], 'revoked') == '1' then
    return {'reused', user_id}
end
redis.call('HSET', KEYS[1], 'revoked', '1')
return {'ok', user_id}
"""


class ConsumeStatus(StrEnum):
    OK = "ok"
    MISSING = "missing"  # токена нет или истёк
    REUSED = "reused"  # токен уже использовали: вероятная кража


@dataclass(frozen=True)
class ConsumeResult:
    status: ConsumeStatus
    user_id: uuid.UUID | None = None


class RefreshSessionRepository:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        self._consume = redis.register_script(CONSUME_SCRIPT)

    async def add(self, token_hash: str, user_id: uuid.UUID, ttl: timedelta) -> None:
        session_key = SESSION_KEY.format(token_hash)
        user_key = USER_SESSIONS_KEY.format(user_id)

        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.hset(session_key, mapping={"user_id": str(user_id), "revoked": "0"})
            pipe.expire(session_key, ttl)
            pipe.sadd(user_key, token_hash)
            # множество живёт не меньше самой свежей сессии
            pipe.expire(user_key, ttl)
            await pipe.execute()

    async def consume(self, token_hash: str) -> ConsumeResult:
        status, *rest = await self._consume(keys=[SESSION_KEY.format(token_hash)])
        return ConsumeResult(ConsumeStatus(status), uuid.UUID(rest[0]) if rest else None)

    async def delete(self, token_hash: str) -> None:
        session_key = SESSION_KEY.format(token_hash)
        user_id = await self._redis.hget(session_key, "user_id")

        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.delete(session_key)
            if user_id:
                pipe.srem(USER_SESSIONS_KEY.format(user_id), token_hash)
            await pipe.execute()

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        user_key = USER_SESSIONS_KEY.format(user_id)
        token_hashes = await self._redis.smembers(user_key)

        await self._redis.delete(user_key, *(SESSION_KEY.format(h) for h in token_hashes))
