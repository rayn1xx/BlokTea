import hashlib
import json

from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.db.redis import get_redis

TTL_SECONDS = 24 * 60 * 60


class IdempotencyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, fastapi_app: FastAPI) -> None:
        super().__init__(app)
        self._fastapi_app = fastapi_app

    def redis(self):
        return self._fastapi_app.dependency_overrides.get(get_redis, get_redis)()

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        idem_key = request.headers.get("idempotency-key")
        if request.method != "POST" or not idem_key:
            return await call_next(request)

        owner = hashlib.sha256(request.headers.get("authorization", "").encode()).hexdigest()[:32]
        key = f"idem:{owner}:{request.url.path}:{idem_key[:128]}"
        redis = self.redis()
        cached = await redis.get(key)
        if cached:
            stored = json.loads(cached)
            return Response(
                content=stored["body"].encode(),
                status_code=stored["status"],
                media_type=stored["media_type"],
                headers={"Idempotent-Replayed": "true"},
            )

        response = await call_next(request)
        if response.status_code >= 500:
            return response
        body = b"".join([chunk async for chunk in response.body_iterator])  # type: ignore[attr-defined]
        await redis.set(
            key,
            json.dumps(
                {
                    "status": response.status_code,
                    "body": body.decode(errors="replace"),
                    "media_type": response.media_type or response.headers.get("content-type", "application/json"),
                }
            ),
            ex=TTL_SECONDS,
        )
        headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
        return Response(content=body, status_code=response.status_code, headers=headers)
