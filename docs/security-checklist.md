# Launch & deploy security checklist

Operator-facing checklist for shipping SugboWay safely. Work top to bottom
before a production deploy; the post-deploy section runs *after* each release.
Deep-dives live in the linked docs.

## Before deploy — configuration

- [ ] **`AUTH_JWT_SECRET` is set, strong, and identical on both backends.**
      Generate with `openssl rand -base64 48`. Set it on the routing API *and*
      the AI service (they must match). Both services now **refuse to boot** in
      production if it's unset, equal to the dev default, or under 32 chars —
      leave `APP_ENV` unset (or `production`) so that enforcement is active.
      Use `APP_ENV=development` only for local runs.
- [ ] **`ALLOWED_ORIGINS` is set explicitly on both backends** to the real web
      origin(s), no `localhost`, no `*`. See
      [cors-hardening.md](cors-hardening.md).
- [ ] **Secrets live only in the Render dashboard**, never committed. The web
      bundle carries only `NEXT_PUBLIC_*` (public URLs + Google *client* ID).
      The weather key is server-side (`WEATHER_API_KEY`).
- [ ] **Any secret ever pasted into a local `.env`, log, or chat has been
      rotated** before go-live (`AUTH_JWT_SECRET`, `GEMINI_API_KEY`,
      `BREVO_API_KEY`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`).
- [ ] **Email + Google sign-in env is consistent:** `BREVO_API_KEY` (preferred
      on Render) or `SMTP_*`; `GOOGLE_CLIENT_ID` matches
      `NEXT_PUBLIC_GOOGLE_CLIENT_ID` if Google sign-in is enabled.
- [ ] **Web app rebuilt if any `NEXT_PUBLIC_*` URL changed** — these are baked
      in at build time, so a restart alone won't pick up a new backend URL.

## After deploy — verification

- [ ] **Run the forged-token smoke test.** It confirms a JWT signed with the
      known dev secret is rejected (401) by both services — i.e. neither is
      running on the insecure default secret:

      ```bash
      python scripts/verify_deploy_security.py \
        --routing-url https://<routing-api-host> \
        --ai-url      https://<ai-service-host>
      ```

      Exit code 0 = safe. A non-zero exit means a service is trusting the dev
      secret — **treat as a release blocker.**

- [ ] **Spot-check CORS** with the preflight recipe in
      [cors-hardening.md](cors-hardening.md#verifying-the-config): an allowed
      origin is echoed, a random origin is not.
- [ ] **Confirm HTTPS-only** — no service reachable over plain HTTP.

## Continuous — dependency scanning

- [ ] **The `security-scan` GitHub Actions workflow is green.**
      (`.github/workflows/security-scan.yml`) It runs `govulncheck` (Go),
      `pip-audit` (Python), and `npm audit` (web) on every push/PR and weekly,
      so newly disclosed CVEs in pinned deps surface even without a code change.
      A red run means a dependency needs bumping.

      Run the same checks locally before a big release:

      ```bash
      # Go
      (cd sugboway-routing-api && go run golang.org/x/vuln/cmd/govulncheck@latest ./...)
      # Python
      (cd sugboway-ai-service && pip-audit -r requirements.txt --strict)
      # Web
      (cd sugboway-web && npm audit --omit=dev --audit-level=high)
      ```

## Notes on what's already enforced in code

These don't need per-deploy action — they're baked into the app — but are worth
knowing when reasoning about the threat model:

- **JWT:** HS256 pinned on both sides; `exp` always issued and verified; no
  `alg:none` / algorithm-confusion path.
- **Rate limiting:** Go API per-IP (300/min global, 20/min on `/auth/*`);
  Python `/chat` per-user (JWT) or per-IP for guests. Limits are in-memory
  **per instance** — they weaken if you scale a service to multiple instances.
- **Input validation:** Go auth bodies use strict JSON binding with length
  caps and a 64 KB body limit; Python `ChatRequest` is `extra="forbid"` with a
  capped `message`. DB access is parameterized (pgx).
- **Google sign-in:** ID token fully validated (audience = client ID, signature,
  expiry, issuer, `email_verified`); account-linking clears any pre-verification
  password (pre-hijacking mitigation).
