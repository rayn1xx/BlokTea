from functools import cached_property

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # локально читаем .env из корня репозитория, в контейнере переменные приходят из docker-compose
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    postgres_user: str = "bloktea"
    postgres_password: str = "bloktea"
    postgres_db: str = "bloktea"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    sql_echo: bool = False

    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_seconds: int = 15 * 60
    refresh_token_ttl_days: int = 30

    # refresh-токен уходит только на эндпоинты /auth; secure=true на https-стенде
    refresh_cookie_name: str = "refresh_token"
    refresh_cookie_path: str = "/api/v1/auth"
    refresh_cookie_secure: bool = False

    @cached_property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @cached_property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"


settings = Settings()
