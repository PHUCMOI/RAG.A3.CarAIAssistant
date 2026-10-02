import os
from functools import lru_cache
from typing import Optional
from urllib.parse import quote
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_ado_connection_string(conn_str: str) -> str:
    """Convert ADO.NET connection string (Host=...;Port=...;Database=...;Username=...;Password=...)
    to a standard PostgreSQL URL (postgresql://user:pass@host:port/dbname).
    If it's already a URL, return it directly.
    """
    conn_str = conn_str.strip()
    if conn_str.startswith("postgresql://") or conn_str.startswith("postgres://"):
        return conn_str

    parts: dict[str, str] = {}
    for item in conn_str.split(";"):
        if "=" in item:
            k, v = item.split("=", 1)
            parts[k.strip().lower()] = v.strip()

    host = parts.get("host", "localhost")
    port = parts.get("port", "5432")
    database = parts.get("database", "car_rag")
    username = parts.get("username") or parts.get("user id", "car_rag")
    password = parts.get("password", "car_rag_dev")

    return f"postgresql://{quote(username, safe='')}:{quote(password, safe='')}@{host}:{port}/{database}"


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
    connectionstrings__postgres: Optional[str] = None

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "car_rag"
    postgres_user: str = "car_rag"
    postgres_password: str = "car_rag_dev"

    frontend_origin: str = Field("http://localhost:5173", validation_alias=AliasChoices("FRONTEND_ORIGIN", "FrontendOrigin"))
    db_pool_min_size: int = 1
    db_pool_max_size: int = 10

    def get_postgres_dsn(self) -> str:
        """Resolve the PostgreSQL DSN with precedence:
        1. DATABASE_URL
        2. ConnectionStrings__Postgres (ADO.NET style)
        3. Individual POSTGRES_* environment variables
        """
        if self.database_url:
            return parse_ado_connection_string(self.database_url)

        conn_str = (
            self.connectionstrings__postgres
            or os.getenv("ConnectionStrings__Postgres")
            or os.getenv("CONNECTIONSTRINGS__POSTGRES")
        )
        if conn_str:
            return parse_ado_connection_string(conn_str)

        return (
            f"postgresql://{quote(self.postgres_user, safe='')}:{quote(self.postgres_password, safe='')}@"
            f"{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
