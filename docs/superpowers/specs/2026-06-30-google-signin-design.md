# Google Sign-In — Design

**Date:** 2026-06-30
**Status:** Approved (pending spec review)

## 1. Goal

Let users sign in / sign up with Google, issuing the **same app JWT** the email/password
flow issues, so the rest of the system (per-tier chat quota in the Python service) is
unchanged. Google accounts are created verified and on the Free tier.

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Flow | **Google Identity Services (GIS) ID-token**: the web gets a Google ID token client-side and POSTs it to Go, which verifies it and returns our JWT. No redirect, no client secret. |
| Account linking | **Link by email.** A Google sign-in whose email already exists logs into that account; if it was unverified, it becomes verified **and its pre-verification password is cleared** (account pre-hijacking mitigation — see §8). Email is the unique key. |
| Google button | Standard **rendered "Continue with Google" button** (not One-Tap). |
| Set-password for Google accounts | **Out of scope.** Google accounts have no password and sign in via Google only. A clean future add. |
| Config | `GOOGLE_CLIENT_ID` (Go, for audience check) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (web, build-time). Feature is off (button hidden / endpoint 503) when unset. |

## 3. Architecture

```
Web (Next.js)
  └─ GIS "Continue with Google" button → user signs in → Google returns an ID token (JWT)
        │  POST /api/v1/auth/google  { credential: "<google-id-token>" }
        ▼
Go routing API
  └─ verify ID token (Google's public keys, aud == GOOGLE_CLIENT_ID, not expired)
     → read sub / email / name / email_verified
     → find-or-create user (link by email) → issue OUR app JWT  { token, user }
        ▼
Web stores our JWT + user exactly like password login. Python AI service unchanged.
```

The tier/quota path is untouched: a Google user is a normal Free user carrying our JWT.

## 4. Backend (Go, `sugboway-routing-api`)

### 4.1 New port — `GoogleVerifier` (keeps the handler testable)

In `domain/ports.go`:

```go
type GoogleIdentity struct {
    Sub           string
    Email         string
    Name          string
    EmailVerified bool
}

type GoogleVerifier interface {
    // Verify validates a Google ID token (signature, audience, expiry) and
    // returns the identity. Returns an error for any invalid token.
    Verify(ctx context.Context, credential string) (*GoogleIdentity, error)
}
```

### 4.2 Adapter — `adapter/google/idtoken.go`

`IDTokenVerifier` implements `domain.GoogleVerifier` using
`google.golang.org/api/idtoken.Validate(ctx, credential, clientID)` (new Go dep; it
fetches and caches Google's public keys and checks `aud`/`exp`). It reads `sub`,
`email`, `name`, and `email_verified` from the validated payload claims, and additionally
checks the issuer is `accounts.google.com` / `https://accounts.google.com`.

A fake verifier is used in handler tests, so no live Google token is needed.

### 4.3 New `UserStore` methods

```go
// CreateVerifiedUser inserts a new account that is already email-verified and has
// no password (used for Google sign-up). Errors if the email already exists.
CreateVerifiedUser(ctx context.Context, name, email string) (*User, error)
// MarkVerifiedByEmail flags an existing account verified (used when linking a
// Google login to a pre-existing unverified password account).
MarkVerifiedByEmail(ctx context.Context, email string) error
```

Postgres adapter: `CreateVerifiedUser` inserts `name, email, password_hash='',
email_verified=TRUE` (tier defaults to `free`); `MarkVerifiedByEmail` runs
`UPDATE users SET email_verified=TRUE, updated_at=now() WHERE email=$1`.

### 4.4 New endpoint — `POST /api/v1/auth/google`

Body `{ "credential": "<google-id-token>" }`. Logic:

1. If the handler has no `GoogleVerifier` (i.e. `GOOGLE_CLIENT_ID` unset) → `503
   {"error":"google_not_configured"}`.
2. `Verify(credential)`; on failure → `401 {"error":"invalid_google_token"}`.
3. If `identity.EmailVerified` is false → `401 {"error":"google_email_unverified"}`
   (defensive; Google emails are normally verified).
4. `GetUserByEmail(identity.Email)`:
   - **not found** → `CreateVerifiedUser(identity.Name, identity.Email)` → issue JWT.
   - **found, unverified** → `MarkVerifiedByEmail` → issue JWT.
   - **found, verified** → issue JWT.
5. Return `200 {token, user}` via the existing `issue` path (so the response carries
   `name`/`email`/`tier` like password login).

The handler gains a `googleVerifier domain.GoogleVerifier` field (nil when unconfigured),
passed via `NewAuthHandler`.

### 4.5 Wiring + config (`main.go`)

Read `GOOGLE_CLIENT_ID`. If set, build `google.NewIDTokenVerifier(clientID)` and pass it
to `NewAuthHandler`; log `Google sign-in: enabled`. If unset, pass `nil` and log that
Google sign-in is disabled. Mount `authGroup.Post("/google", authHandler.Google)`.

### 4.6 New Go dependency

`google.golang.org/api/idtoken` (+ its transitive deps). Added via `go get`.

## 5. Web (`sugboway-web`)

### 5.1 `GoogleButton` component (`src/components/auth/GoogleButton.tsx`)

- If `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is unset → render nothing (feature off, no breakage).
- Otherwise: load the GIS script (`https://accounts.google.com/gsi/client`) once,
  `google.accounts.id.initialize({ client_id, callback })`, and
  `google.accounts.id.renderButton(divRef, { type, theme, text, width })` to draw the
  official button. The callback receives `{ credential }` and calls
  `useAuth().googleLogin(credential)`; on success the modal closes, on error it shows a
  message via an `onError` prop.
- A minimal TypeScript declaration for `window.google.accounts.id` (no `any`, to satisfy
  the repo's strict lint).

### 5.2 API + hook

- `authApi.googleLogin(credential)` → POST `/api/v1/auth/google` → `{ok, token?, user?,
  error?}` (mirrors `login`). Reuses the existing 30s-timeout `post`.
- `useAuth().googleLogin(credential)` → calls the API, persists token+user on success,
  returns `{ok, error}`.

### 5.3 `AuthModal`

Render `<GoogleButton onError={setError} />` plus a small "or" divider above the
email/password form, on **both** the Login and Register tabs (one button does both —
it's find-or-create). The check-email state is unaffected.

## 6. Data flow — scenarios

1. **New Google user:** button → ID token → `/auth/google` → no existing account →
   create verified Free user (name from Google) → our JWT → logged in.
2. **Existing password user (verified), same email:** logs into that account.
3. **Existing password user (unverified), same email:** account becomes verified and its
   pre-verification password is **cleared**, then logs in via Google. (The password was
   set before email ownership was proven, so it can't be trusted — see §8. The user
   continues with Google; setting a new password is a future password-reset flow.)
4. **Google not configured:** button hidden; endpoint returns 503 if called directly.

## 7. Error handling

- Invalid/expired/forged ID token → 401 `invalid_google_token` (the `idtoken` validation
  fails closed; issuer + audience are checked).
- Google reports the email unverified → 401 `google_email_unverified`.
- Network failure on the web POST → caught by the modal's existing try/catch → generic
  "can't reach the server" message.
- `GOOGLE_CLIENT_ID` unset → endpoint 503, button hidden.

## 8. Security notes

- The ID token is verified server-side against Google's keys with the audience pinned to
  our client ID — a token minted for another app is rejected.
- No client secret is involved (ID-token flow), so nothing secret ships to the browser;
  the client ID is public by design.
- Google accounts have an empty `password_hash`, so password login for them fails
  (`bcrypt` on `''` never matches) — they can only use Google. Acceptable and documented.
- **Account pre-hijacking mitigation (decided at final review):** an attacker could
  pre-register a victim's email with the attacker's password (account sits unverified).
  If linking via Google merely verified the account, that attacker password would remain
  valid. Therefore linking a **never-verified** account also **clears its
  `password_hash`** — only the Google-proven owner keeps access. Verified accounts keep
  their password (they proved email ownership themselves). Tradeoff accepted: a
  legitimate self-registered-but-never-verified user loses that password and continues
  with Google (password reset is a future flow).
- Our JWT, quota, and tiers are unchanged; a Google user is an ordinary Free user.

## 9. Testing

- **Go:** handler tests for `/auth/google` with a **fake `GoogleVerifier`** + the
  in-memory fake store, covering: new user (created, verified, JWT), existing-unverified
  (linked + verified), existing-verified (logged in), unconfigured verifier (503), and a
  verifier error (401). The fake store implements the two new methods.
- **Web:** no test runner; `tsc --noEmit` (clean) + lint (no new errors) + manual
  walkthrough once a real `GOOGLE_CLIENT_ID` is set.

## 10. Config & docs

- `.env.example`: `GOOGLE_CLIENT_ID` (routing-api), `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (web).
- New `docs/google-signin-setup.md`: create a Google Cloud project → OAuth consent screen
  → **Credentials → OAuth client ID → Web application** → Authorized JavaScript origins =
  the web URL(s) (`https://sugboway-web.onrender.com`, `http://localhost:3000`) → copy
  the Client ID → set it on both services → **rebuild the web** (it's a build-time var).
- README/CLAUDE.md: note Google sign-in (ID-token flow, link-by-email, optional via env).

## 11. Out of scope (explicit)

Setting a password for Google-created accounts; One-Tap / auto-select prompts; Google
account *unlinking*; other OAuth providers; refresh-token/offline access (we only need
identity at sign-in).

## 12. Files

**Go:** `domain/ports.go` (+ `GoogleVerifier`, `GoogleIdentity`, 2 store methods),
`adapter/google/idtoken.go` (new), `adapter/repository/users.go` (2 methods),
`adapter/api/auth_handler.go` (`Google` handler + field), `adapter/api/auth_handler_test.go`
(fake verifier + store methods + tests), `main.go` (wire), `go.mod`/`go.sum`.
**Web:** `src/components/auth/GoogleButton.tsx` (new), `src/lib/authApi.ts`,
`src/components/AuthProvider.tsx`, `src/components/auth/AuthModal.tsx`.
**Docs:** `.env.example` (routing-api + web), `docs/google-signin-setup.md`, README, CLAUDE.md.
