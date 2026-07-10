#!/usr/bin/env python3
"""Post-deploy security smoke test.

Asserts the single most important production invariant: a JWT signed with the
publicly-known *dev* secret is REJECTED by both backends. If either service
accepts it, that service is running with the insecure default AUTH_JWT_SECRET
(or a leaked/shared dev secret) and every user/tier is forgeable — treat a
failure here as a critical, block-the-release finding.

Runs against the *live* deployed URLs. Uses only the Python standard library
(no PyJWT / requests), so it works anywhere Python 3 does.

Usage:
    python scripts/verify_deploy_security.py \
        --routing-url https://sugboway-routing-api.onrender.com \
        --ai-url      https://sugboway-ai-service.onrender.com

Or via env vars (CI-friendly):
    ROUTING_API_URL=https://... AI_API_URL=https://... \
        python scripts/verify_deploy_security.py

Exit code 0 = all checks passed. Non-zero = a check failed or errored.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request

# The insecure fallback signing key. Must stay in sync with the Go
# (main.go: devJWTSecret) and Python (auth_quota._DEV_JWT_SECRET) constants.
DEV_JWT_SECRET = "dev-insecure-secret-change-me"

TIMEOUT = 20  # seconds; Neon/Render cold starts can be slow on first hit.


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def forge_token(secret: str) -> str:
    """Mint an HS256 JWT (max tier, far-future expiry) signed with `secret`."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": "deploy-smoke-test",
        "email": "smoke-test@sugboway.invalid",
        "tier": "max",
        "exp": int(time.time()) + 3600,
    }
    signing_input = (
        _b64url(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + _b64url(json.dumps(payload, separators=(",", ":")).encode())
    )
    sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return signing_input + "." + _b64url(sig)


def _request(method: str, url: str, token: str, body: dict | None) -> int:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code  # 401 etc. arrive here — exactly what we want to inspect.


def check(name: str, method: str, url: str, token: str, body: dict | None) -> bool:
    """A check passes iff the forged token is rejected with 401."""
    try:
        status = _request(method, url, token, body)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"  ERROR  {name}: could not reach {url} ({e})")
        return False
    if status == 401:
        print(f"  PASS   {name}: forged dev-secret token rejected (401)")
        return True
    print(
        f"  FAIL   {name}: forged dev-secret token returned HTTP {status}, "
        f"expected 401 — service is trusting the insecure dev secret!"
    )
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--routing-url", default=os.getenv("ROUTING_API_URL"))
    ap.add_argument("--ai-url", default=os.getenv("AI_API_URL"))
    args = ap.parse_args()

    if not args.routing_url or not args.ai_url:
        ap.error(
            "both --routing-url and --ai-url (or ROUTING_API_URL / AI_API_URL) "
            "are required"
        )

    token = forge_token(DEV_JWT_SECRET)
    routing = args.routing_url.rstrip("/")
    ai = args.ai_url.rstrip("/")

    print("Deploy security smoke test — forged dev-secret token must be rejected:")
    results = [
        check(
            "routing-api /auth/me",
            "GET",
            f"{routing}/api/v1/auth/me",
            token,
            None,
        ),
        check(
            "ai-service /chat",
            "POST",
            f"{ai}/api/v1/chat",
            token,
            {"message": "smoke test"},
        ),
    ]

    if all(results):
        print("\nAll security checks passed.")
        return 0
    print("\nSECURITY CHECK FAILED — do not consider this deploy safe.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
