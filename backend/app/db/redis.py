from redis.asyncio import Redis

from app.core.config import settings

# клиент держит пул соединений: один на процесс, закрывается в lifespan приложения
redis_client: Redis = Redis.from_url(settings.redis_url, decode_responses=True)


def get_redis() -> Redis:
    return redis_client
