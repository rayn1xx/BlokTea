import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher as Argon2Hasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError


class InvalidAccessTokenError(Exception):
    pass


class PasswordHasher:
    def __init__(self) -> None:
        self._argon2 = Argon2Hasher()

    def hash(self, password: str) -> str:
        return self._argon2.hash(password)

    def verify(self, password_hash: str, password: str) -> bool:
        try:
            return self._argon2.verify(password_hash, password)
        except (VerifyMismatchError, InvalidHashError):
            return False

    def needs_rehash(self, password_hash: str) -> bool:
        return self._argon2.check_needs_rehash(password_hash)


class TokenFactory:
    """Выпускает access-токены (JWT) и refresh-токены (случайная строка, в БД: её хеш)."""

    def __init__(self, secret: str, algorithm: str, access_ttl: timedelta, refresh_ttl: timedelta) -> None:
        self._secret = secret
        self._algorithm = algorithm
        self.access_ttl = access_ttl
        self.refresh_ttl = refresh_ttl

    def create_access_token(self, user_id: uuid.UUID, now: datetime | None = None) -> str:
        now = now or datetime.now(UTC)
        payload = {"sub": str(user_id), "iat": now, "exp": now + self.access_ttl, "type": "access"}
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    def decode_access_token(self, token: str) -> uuid.UUID:
        try:
            payload = jwt.decode(
                token, self._secret, algorithms=[self._algorithm], options={"require": ["sub", "exp"]}
            )
            if payload.get("type") != "access":
                raise InvalidAccessTokenError
            return uuid.UUID(payload["sub"])
        except (jwt.PyJWTError, ValueError) as e:
            raise InvalidAccessTokenError from e

    @staticmethod
    def create_refresh_token() -> str:
        return secrets.token_urlsafe(48)

    @staticmethod
    def hash_refresh_token(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()
