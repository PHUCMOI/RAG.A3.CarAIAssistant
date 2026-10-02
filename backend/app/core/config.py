from functools import lru_cache
from typing import Optional
from urllib.parse import quote
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    port: int = 5080
    host: str = "0.0.0.0"

    database_url: Optional[str] = None

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "car_rag"
    postgres_user: str = "car_rag"
    postgres_password: str = "car_rag_dev"

    frontend_origin: str = "http://localhost:5173"
    db_pool_min_size: int = 1
    db_pool_max_size: int = 10

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value.startswith(("postgresql://", "postgres://")):
            raise ValueError("DATABASE_URL must be a PostgreSQL URL")
        return value

    def get_postgres_dsn(self) -> str:
        """Prefer DATABASE_URL; otherwise build a URL from POSTGRES_* settings."""
        if self.database_url:
            return self.database_url

        return (
            f"postgresql://{quote(self.postgres_user, safe='')}:{quote(self.postgres_password, safe='')}@"
            f"{self.postgres_host}:{self.postgres_port}/{quote(self.postgres_db, safe='')}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
