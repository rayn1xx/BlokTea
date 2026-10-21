from app.core.config import Settings


def make_settings(**overrides) -> Settings:
    return Settings(_env_file=None, **overrides)


def test_database_url_built_from_parts() -> None:
    settings = make_settings(
        postgres_user="u", postgres_password="p", postgres_host="db", postgres_port=6543, postgres_db="name"
    )

    assert settings.database_url == "postgresql+asyncpg://u:p@db:6543/name"


def test_redis_url_built_from_parts() -> None:
    settings = make_settings(redis_host="cache", redis_port=6380, redis_db=3)

    assert settings.redis_url == "redis://cache:6380/3"


def test_refresh_cookie_limited_to_auth_endpoints() -> None:
    assert make_settings().refresh_cookie_path == "/api/v1/auth"
