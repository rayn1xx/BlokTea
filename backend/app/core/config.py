from functools import cached_property

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
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
    access_token_ttl_seconds: int = Field(
        15 * 60, validation_alias=AliasChoices("access_token_ttl_seconds", "access_ttl_seconds")
    )
    refresh_token_ttl_days: int = 30

    refresh_cookie_name: str = "refresh_token"
    refresh_cookie_path: str = "/api/v1/auth"
    refresh_cookie_secure: bool = False

    mocks_base_url: str = "http://localhost:8100"
    mocks_timeout_seconds: float = 5.0

    demo_mode: bool = True
    seed_demo: bool = True

    llm_enabled: bool = False
    ollama_base_url: str = "http://localhost:11434"
    llm_model_text: str = "qwen3.5:9b"
    llm_model_vision: str | None = None
    llm_timeout_ms: int = 30_000
    llm_temperature: float = 0.1

    rate_percent_default: float = 15.0
    load_threshold_percent: float = 30.0
    load_target_percent: float = 26.5

    upload_dir: str = "data/uploads"

    rate_limit_login: int = 10
    rate_limit_codes: int = 10
    rate_limit_window_seconds: int = 60

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
