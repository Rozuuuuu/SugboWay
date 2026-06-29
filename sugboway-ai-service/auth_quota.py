"""Shared-secret JWT verification and per-tier quota limits.

Mirrors the Go side (domain/auth.go): same HS256 secret, same tier numbers.
"""
import os
import jwt

# None means unlimited. Guests (no token) get GUEST_LIMIT.
TIER_LIMITS = {"free": 10, "pro": 100, "max": None}
GUEST_LIMIT = 5


def _secret() -> str:
    return os.environ.get("AUTH_JWT_SECRET", "dev-insecure-secret-change-me")


def verify_token(token: str) -> dict:
    """Decode and verify an HS256 JWT. Raises jwt.PyJWTError on failure."""
    payload = jwt.decode(token, _secret(), algorithms=["HS256"])
    return {"user_id": str(payload.get("sub", "")), "tier": payload.get("tier", "free")}


def tier_limit(tier: str):
    """Hourly question limit for a tier (None = unlimited)."""
    return TIER_LIMITS.get(tier, TIER_LIMITS["free"])
