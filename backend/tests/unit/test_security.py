import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.security import InvalidAccessTokenError, PasswordHasher, TokenFactory

SECRET = "unit-secret"


@pytest.fixture(scope="module")
def hasher() -> PasswordHasher:
    return PasswordHasher()


@pytest.fixture
def tokens() -> TokenFactory:
    return TokenFactory(SECRET, "HS256", access_ttl=timedelta(minutes=15), refresh_ttl=timedelta(days=30))


class TestPasswordHasher:
    def test_hash_is_not_plain_password(self, hasher: PasswordHasher) -> None:
        password_hash = hasher.hash("secret")

        assert password_hash != "secret"
        assert password_hash.startswith("$argon2")

    def test_same_password_gives_different_hashes(self, hasher: PasswordHasher) -> None:
        assert hasher.hash("secret") != hasher.hash("secret")

    def test_verify_correct_password(self, hasher: PasswordHasher) -> None:
        assert hasher.verify(hasher.hash("secret"), "secret") is True

    def test_verify_wrong_password(self, hasher: PasswordHasher) -> None:
        assert hasher.verify(hasher.hash("secret"), "Secret") is False

    def test_verify_broken_hash_returns_false(self, hasher: PasswordHasher) -> None:
        assert hasher.verify("not-a-hash", "secret") is False

    def test_fresh_hash_does_not_need_rehash(self, hasher: PasswordHasher) -> None:
        assert hasher.needs_rehash(hasher.hash("secret")) is False


class TestAccessToken:
    def test_roundtrip_returns_user_id(self, tokens: TokenFactory) -> None:
        user_id = uuid.uuid4()

        assert tokens.decode_access_token(tokens.create_access_token(user_id)) == user_id

    def test_payload_has_expiry_by_ttl(self, tokens: TokenFactory) -> None:
        now = datetime.now(UTC).replace(microsecond=0)
        token = tokens.create_access_token(uuid.uuid4(), now)

        payload = jwt.decode(token, SECRET, algorithms=["HS256"])

        assert payload["type"] == "access"
        assert payload["exp"] - payload["iat"] == 15 * 60

    def test_expired_token_rejected(self, tokens: TokenFactory) -> None:
        token = tokens.create_access_token(uuid.uuid4(), datetime.now(UTC) - timedelta(hours=1))

        with pytest.raises(InvalidAccessTokenError):
            tokens.decode_access_token(token)

    def test_token_signed_with_other_secret_rejected(self, tokens: TokenFactory) -> None:
        other = TokenFactory("other-secret", "HS256", timedelta(minutes=15), timedelta(days=30))

        with pytest.raises(InvalidAccessTokenError):
            tokens.decode_access_token(other.create_access_token(uuid.uuid4()))

    @pytest.mark.parametrize(
        "payload",
        [
            pytest.param({"sub": str(uuid.uuid4()), "type": "refresh"}, id="wrong-type"),
            pytest.param({"sub": str(uuid.uuid4())}, id="no-type"),
            pytest.param({"type": "access"}, id="no-sub"),
            pytest.param({"sub": "not-a-uuid", "type": "access"}, id="sub-not-uuid"),
        ],
    )
    def test_malformed_payload_rejected(self, tokens: TokenFactory, payload: dict) -> None:
        token = jwt.encode({**payload, "exp": datetime.now(UTC) + timedelta(minutes=5)}, SECRET, "HS256")

        with pytest.raises(InvalidAccessTokenError):
            tokens.decode_access_token(token)

    def test_token_without_exp_rejected(self, tokens: TokenFactory) -> None:
        token = jwt.encode({"sub": str(uuid.uuid4()), "type": "access"}, SECRET, "HS256")

        with pytest.raises(InvalidAccessTokenError):
            tokens.decode_access_token(token)

    def test_garbage_rejected(self, tokens: TokenFactory) -> None:
        with pytest.raises(InvalidAccessTokenError):
            tokens.decode_access_token("garbage")


class TestRefreshToken:
    def test_tokens_are_unique(self, tokens: TokenFactory) -> None:
        assert len({tokens.create_refresh_token() for _ in range(100)}) == 100

    def test_hash_is_sha256_hex_and_deterministic(self, tokens: TokenFactory) -> None:
        token = tokens.create_refresh_token()
        token_hash = tokens.hash_refresh_token(token)

        assert token_hash == tokens.hash_refresh_token(token)
        assert len(token_hash) == 64
        assert token not in token_hash
