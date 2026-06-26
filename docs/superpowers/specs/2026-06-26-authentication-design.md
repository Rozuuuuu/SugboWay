# SugboWay Authentication & Plan Tiers — Design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

## 1. Goal

Add real user accounts to SugboWay with email-verified registration, login, and a
four-tier quota/pricing model for the AI chat. Replace the current front-end-only
`isPremiumUser` / `remainingQuota` demo with server-backed identity and per-account
quota enforcement.

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Auth depth | **Real backend auth** (not a front-end demo) |
| Auth home | **Go** routing API owns users + issues JWT; **Python** AI service verifies JWT + enforces quota |
| Payments | **Demo upgrade** — `/upgrade` sets the tier directly; pricing shown for realism; no Stripe |
| Email verification | **Required before login**; delivery via **SMTP** (operator-provided creds) |
| Profile tab | Keep Emergency hotlines; **remove** mock "Saved stops"; focus on login/register + questions-left |
| UI/UX scope | Polish only the surfaces this feature touches (auth modal, pricing, profile, quota, chat gating) |

### Tiers

| Tier | Who | Questions / hour | Extra perks | Price |
|---|---|---|---|---|
| Guest | Not logged in | 5 (per IP) | — | — |
| Free | Registered + verified | 10 (per user) | — | ₱0 |
| Pro | Paid (demo) | 100 (per user) | Offline maps | ₱149 / mo |
| Max | Paid (demo) | Unlimited | Offline maps, priority routing, early crowding alerts | ₱349 / mo |

**Only the chat quota is server-enforced.** The "extra perks" are descriptive copy on
the pricing cards — they are **not** functional feature-gates. In particular the offline
map already works for all users today and stays that way (gating it would regress
existing free functionality). Turning a perk into a real gate would be a separate,
future change.

## 3. Architecture

```
Web (Next.js)
  │  POST /api/v1/auth/{register,login,resend,upgrade}, GET /me
  ▼
Go routing API  ──────▶  Postgres (users table)        ──────▶  SMTP server
  │  (bcrypt, HS256 JWT with tier claim,                          (verification email)
  │   email verification tokens, GET /verify redirect)
  │
Web attaches  Authorization: Bearer <JWT>
  ▼
Python AI service  /api/v1/chat
  (verifies JWT with shared secret, reads tier claim,
   enforces per-user hourly quota; guests = 5/IP unchanged)
```

The **tier travels inside the JWT**, so the Python service never queries the DB — it
verifies the signature and reads the claim. A demo upgrade reissues the token with the
new tier.

## 4. Backend — Go (`sugboway-routing-api`)

### 4.1 Migration `adapter/repository/migrations/0005_users_auth.sql`

```sql
CREATE TABLE IF NOT EXISTS users (
  id                       BIGSERIAL PRIMARY KEY,
  email                    TEXT NOT NULL UNIQUE,        -- stored lowercased
  password_hash            TEXT NOT NULL,               -- bcrypt
  tier                     TEXT NOT NULL DEFAULT 'free', -- free | pro | max
  email_verified           BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token_hash  TEXT,                        -- sha256 of the emailed token
  verification_expires_at  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
```

Auto-applied on boot by the existing embedded migrator (no manual SQL).

### 4.2 Domain (pure, unit-tested) — `domain/auth.go`, `domain/auth_test.go`

- `HashPassword(pw) / CheckPassword(hash, pw)` — bcrypt wrappers.
- `GenerateToken() (raw, hash)` — random 32-byte token; store the sha256 hash, email the raw.
- `IssueJWT(secret, userID, email, tier, ttl) / ParseJWT(secret, str)` — HS256.
- `TierHourlyLimit(tier) *int` — `free→10, pro→100, max→nil(unlimited)`; shared contract
  the Python side mirrors. (Pure → directly unit-tested, per repo convention.)

### 4.3 Email port (keeps handlers testable) — `domain/ports.go` + adapter

```go
type EmailSender interface {
    SendVerification(ctx, toEmail, verifyURL string) error
}
```

- `adapter/email/smtp.go` — real sender using Go stdlib `net/smtp` (no new dep).
- A fake sender is injected in handler tests so no real SMTP is needed.

### 4.4 Endpoints (`adapter/api/handler.go`, group `/api/v1/auth`)

| Method + path | Auth | Behavior |
|---|---|---|
| `POST /register` | — | Validate email/password (min length); 409 if email exists. Create **unverified** user, generate token, send email. Returns `202 {status:"verify_email"}` — **no JWT yet**. If the email send fails, still 202 with `{email_sent:false}` so the UI can offer Resend. |
| `GET /verify?token=…` | — | Look up by token hash + unexpired → set `email_verified=true`, clear token. **302 redirect** to `${APP_BASE_URL}/?verified=1` (or `?verified=0` on failure). |
| `POST /resend` | — | Given an email, if an unverified user exists, regenerate token + resend. Always returns `200` (no account enumeration). Light cooldown via `verification_expires_at`. |
| `POST /login` | — | bcrypt check. If unverified → `403 {error:"email_not_verified"}`. If verified → `200 {token, user:{email,tier}}`. Wrong creds → `401 {error:"invalid_credentials"}` (generic). |
| `POST /upgrade` | Bearer | Demo: body `{plan:"pro"|"max"}` → set tier, return fresh `{token, user}`. |
| `GET /me` | Bearer | `{email, tier}`. |

JWT: HS256, claims `sub,email,tier,iat,exp` (7-day TTL). Auth middleware parses the
`Authorization: Bearer` header, 401 on invalid/expired.

### 4.5 New Go config (env)

`AUTH_JWT_SECRET` (required in prod; dev default + loud warning), `APP_BASE_URL`
(web origin for the post-verify redirect), `PUBLIC_API_URL` (this API's public origin,
used to build the verify link in the email), and SMTP: `SMTP_HOST, SMTP_PORT,
SMTP_USER, SMTP_PASS, SMTP_FROM`.

### 4.6 New Go dependency

`github.com/golang-jwt/jwt/v5`. bcrypt comes from `golang.org/x/crypto/bcrypt`
(already vendored as an indirect dep).

## 5. Backend — Python (`sugboway-ai-service`)

- **New dep:** `PyJWT` (added to `requirements.txt`).
- `main.py` `/api/v1/chat`:
  - Read optional `Authorization: Bearer <jwt>`.
  - **No token** → existing guest path: 5/hour keyed by IP (unchanged).
  - **Valid token** → identify `user_id` + `tier`; enforce the tier limit
    (`free=10, pro=100, max=unlimited`) keyed by `user_id` in the existing
    sliding-window store; include `tier` and `remaining` in the response.
  - **Token present but invalid/expired** → `401` so the client clears it.
- Limits live in one small module mirroring Go's `TierHourlyLimit`; a
  `scripts/verify_auth.py` smoke test checks JWT parse + tier→limit (consistent with
  the existing `scripts/verify_*` pattern; there is no pytest suite).
- Shared secret: same `AUTH_JWT_SECRET` env as Go.

## 6. Web (`sugboway-web`)

### 6.1 State — `AuthProvider` + `useAuth()`

A small context (mirrors the existing `ThemeProvider`; **no Zustand**), persisted to
`localStorage`. Exposes `{user, token, isAuthed, register, login, logout, resend,
upgrade}` and a `tier`. Initialized from `localStorage` on mount; reads `?verified=1`
on load to surface a "Email verified — please log in" toast.

### 6.2 Components

- **`AuthModal`** — Login / Register tabs; labelled inputs, inline validation, real
  error + loading states; a dedicated **"Check your email"** state after register and on
  `email_not_verified` login, with a **Resend** button.
- **`PricingPlans`** — four cards (Guest / Free / Pro ₱149 / Max ₱349) using the
  sand-sea tokens + Cebu Blue accent; "Current plan" badge; demo upgrade buttons
  (require auth → open `AuthModal` if logged out).
- **Quota indicator** — "X of N this hour" derived from the chat response, shown in
  chat + profile.

### 6.3 Chat wiring (`app/page.tsx`)

`handleSendMessage` attaches `Authorization` when a token exists. On quota-hit:
guest → "Register for 10/hr", free → "Upgrade to Pro/Max". The hard-coded
`isPremiumUser` / `remainingQuota` state is removed in favor of `useAuth` + the chat
response.

### 6.4 Profile tab rework

- **Logged out:** a clean card with Sign in / Register CTAs (opens `AuthModal`).
- **Logged in:** email, tier badge, **questions left this hour**, and `PricingPlans`.
- Keep the **Emergency hotlines** section. **Remove** the mock "Saved stops" section.

### 6.5 UI/UX polish ("not AI slop")

Scoped to the touched surfaces: consistent design tokens (no generic purple-SaaS
gradients), bilingual microcopy matching the existing voice, accessible forms (labels,
`aria-invalid`, error text), and proper loading/empty/error states throughout the auth
and pricing flows.

## 7. Data flow — key scenarios

1. **Register:** web → `POST /register` → user row (unverified) + email sent →
   "check your email." User clicks link → `GET /verify` → redirect `/?verified=1` →
   toast → user logs in → JWT stored.
2. **Chat as guest:** no token → Python 5/IP. On the 6th, UI nudges to register.
3. **Chat as free:** JWT(tier=free) → Python 10/user. On the 11th, UI nudges to upgrade.
4. **Upgrade (demo):** `POST /upgrade {plan}` → tier updated, fresh JWT → quota rises
   immediately on the next chat.

## 8. Error handling

- Duplicate email → 409; generic login failure → 401; unverified login → 403 + Resend.
- Email send failure on register → account still created, UI offers Resend.
- Backend unreachable → auth actions show an error; chat still falls back to the guest
  path (web already ships mock routes for offline resilience).
- Invalid/expired JWT → 401 → client clears token and reverts to guest.

## 9. Testing

- **Go:** unit tests for `domain/auth.go` (hash/verify, token gen+hash, JWT
  issue/parse, `TierHourlyLimit`); handler tests for register/login/verify/upgrade
  using a **fake `EmailSender`** (no real SMTP).
- **Python:** `scripts/verify_auth.py` checks JWT parse + tier→limit mapping and the
  guest-vs-user limiter selection.
- **Web:** no test runner; verified via `npm run lint` + `npx tsc --noEmit` + manual
  walkthrough of register → verify → login → chat → upgrade.

## 10. Security notes (accepted tradeoffs for this showcase)

- JWT in `localStorage` (XSS-exposed) — acceptable here; documented.
- Verification tokens stored **hashed** (sha256); 24-hour expiry; single use.
- Generic auth errors to avoid account enumeration; Resend always returns 200.
- `AUTH_JWT_SECRET` shared across both backends via env (dev default warns loudly).
- TLS provided by Render. Login-attempt throttling noted as **future hardening**, not
  built now.

## 11. Out of scope (explicit)

Real payments/Stripe; password reset flow; OAuth/social login; multi-device session
revocation; a broad app-wide visual redesign beyond the auth/pricing/profile surfaces.

## 12. Docs to update on implementation

`README.md` (auth + tiers, env vars), `CLAUDE.md` (new auth flow across services),
and the three `.env.example` files (`AUTH_JWT_SECRET`, SMTP vars, `APP_BASE_URL`,
`PUBLIC_API_URL`).
