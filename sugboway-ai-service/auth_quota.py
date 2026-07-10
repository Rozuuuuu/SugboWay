"""Shared-secret JWT verification and per-tier quota limits.

Mirrors the Go side (domain/auth.go): same HS256 secret, same tier numbers.
"""
import os
import jwt

# None means unlimited. Guests (no token) get GUEST_LIMIT.
TIER_LIMITS = {"free": 10, "pro": 100, "max": None}
GUEST_LIMIT = 5

# Insecure fallback signing key permitted only in local development
# (APP_ENV=development). Must match the Go side's devJWTSecret.
_DEV_JWT_SECRET = "dev-insecure-secret-change-me"


def _is_dev_env() -> bool:
    env = (os.environ.get("APP_ENV") or os.environ.get("ENV") or "").strip().lower()
    return env in ("development", "dev")


def _secret() -> str:
    """Return the shared JWT secret, failing closed in production.

    A missing secret would otherwise fall back to a publicly-known default,
    letting anyone forge tokens for any user/tier. Outside explicit local dev we
    refuse to run rather than validate forgeable tokens.
    """
    secret = os.environ.get("AUTH_JWT_SECRET")
    if secret is not None:
        secret = secret.strip()  # tolerate a trailing newline/space from the dashboard
    if _is_dev_env():
        return secret or _DEV_JWT_SECRET
    if not secret:
        # Names-only diagnostic (never values) so a Render free-tier deploy log
        # reveals a typo'd key or an unlinked env group without shell access.
        related = sorted(
            k for k in os.environ
            if any(t in k.upper() for t in ("AUTH", "JWT", "SECRET"))
        )
        raise RuntimeError(
            "AUTH_JWT_SECRET is not set (empty or missing). Set a strong secret "
            "(>=32 chars), identical to the routing API. Use APP_ENV=development "
            f"only locally. Env keys visible to this process matching "
            f"AUTH/JWT/SECRET: {related or 'none'}."
        )
    if secret == _DEV_JWT_SECRET:
        raise RuntimeError(
            "AUTH_JWT_SECRET is set to the insecure dev default. "
            "Set a unique, strong secret in production."
        )
    return secret


def verify_token(token: str) -> dict:
    """Decode and verify an HS256 JWT. Raises jwt.PyJWTError on failure."""
    payload = jwt.decode(token, _secret(), algorithms=["HS256"])
    return {"user_id": str(payload.get("sub", "")), "tier": payload.get("tier", "free")}


def tier_limit(tier: str):
    """Hourly question limit for a tier (None = unlimited)."""
    return TIER_LIMITS.get(tier, TIER_LIMITS["free"])
