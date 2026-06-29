"""Smoke test for auth_quota: run `python scripts/verify_auth.py` (exit 0 = pass)."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("AUTH_JWT_SECRET", "test-secret")

import jwt  # noqa: E402
import auth_quota  # noqa: E402


def main() -> int:
    # tier_limit mapping
    assert auth_quota.tier_limit("free") == 10
    assert auth_quota.tier_limit("pro") == 100
    assert auth_quota.tier_limit("max") is None
    assert auth_quota.tier_limit("bogus") == 10
    assert auth_quota.GUEST_LIMIT == 5

    # round-trip a token created with the same secret
    token = jwt.encode({"sub": "7", "email": "a@b.com", "tier": "pro"}, "test-secret", algorithm="HS256")
    claims = auth_quota.verify_token(token)
    assert claims["user_id"] == "7", claims
    assert claims["tier"] == "pro", claims

    # wrong secret must raise
    bad = jwt.encode({"sub": "7", "tier": "max"}, "other-secret", algorithm="HS256")
    try:
        auth_quota.verify_token(bad)
        print("FAIL: bad-secret token verified")
        return 1
    except jwt.PyJWTError:
        pass

    print("verify_auth: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
