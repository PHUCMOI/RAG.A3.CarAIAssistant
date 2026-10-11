"""Only trusted service callers may supply evidence or model interpretations."""
import secrets
from fastapi import Header, HTTPException
from app.core.config import get_settings


def is_internal(token: str | None) -> bool:
    expected = get_settings().ai_internal_token.get_secret_value()
    return bool(expected and token and secrets.compare_digest(expected.encode('utf-8'), token.encode('utf-8')))


def require_internal(x_autowise_internal_token: str | None = Header(default=None)):
    if not is_internal(x_autowise_internal_token):
        raise HTTPException(403, "Endpoint chỉ dành cho dịch vụ nội bộ.")
