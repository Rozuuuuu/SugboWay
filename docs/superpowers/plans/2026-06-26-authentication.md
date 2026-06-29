# Authentication & Plan Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real, email-verified user accounts with a four-tier AI-chat quota, where the Go service owns identity (users + JWT) and the Python service enforces per-tier quota from the JWT claim.

**Architecture:** Go routing API gains a `users` table (auto-migrated), bcrypt passwords, SMTP email verification, and HS256 JWTs whose `tier` claim travels to the Python AI service. Python verifies the shared-secret JWT and enforces per-user hourly limits (guests stay 5/IP). The Next.js web app gets an `AuthProvider`/`useAuth` hook, an auth modal, a pricing section, and a reworked Profile tab.

**Tech Stack:** Go 1.21 (Fiber, pgx, `golang-jwt/jwt/v5`, `x/crypto/bcrypt`, stdlib `net/smtp`), Python (FastAPI, `PyJWT`), Next.js 16 / React 19 / Tailwind v4.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-26-authentication-design.md`.
- Tiers (server-enforced quota only; perks are pricing-card copy, **not** feature gates): Guest **5/hr (per IP)**, Free **10/hr**, Pro **100/hr** (₱149/mo), Max **unlimited** (₱349/mo).
- Tier identifiers are exactly `free`, `pro`, `max`. Guests are unauthenticated.
- Shared secret env `AUTH_JWT_SECRET` is identical in the Go and Python services. Dev default `dev-insecure-secret-change-me` with a loud startup warning.
- JWT: HS256, claims `sub` (user id as string), `email`, `tier`, `iat`, `exp`; TTL 7 days.
- Verification tokens: 32 random bytes hex; stored **sha256-hashed**; 24-hour expiry; single use.
- Users must verify email **before login** succeeds.
- Web state uses a React context + hook (like `ThemeProvider`) — **no Zustand**. Components use arrow functions, ES module imports, `camelCase` files except `PascalCase` components. Use existing design tokens (sand/sea palette, Cebu Blue `#0056B3`); no generic purple-SaaS gradients.
- The web app has **no test runner**: its "tests" are `npm run lint` and `npx tsc --noEmit`, run from `sugboway-web/`.
- Before writing non-trivial Next.js/React code, consult `sugboway-web/node_modules/next/dist/docs/` (the bundled Next 16 has breaking changes).
- All git commits end with the trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Run Go commands from `sugboway-routing-api/`, Python from `sugboway-ai-service/`, web from `sugboway-web/`.

---

## File Structure

**Go (`sugboway-routing-api/`)**
- Create `adapter/repository/migrations/0006_users_auth.sql` — users table.
- Create `domain/auth.go` / `domain/auth_test.go` — pure: passwords, tokens, JWT, tier limits.
- Modify `domain/ports.go` — add `User`, `UserStore`, `EmailSender` interfaces.
- Create `adapter/repository/users.go` — `PostgresUserStore` (implements `UserStore`).
- Create `adapter/email/smtp.go` — `SMTPSender` (implements `EmailSender`).
- Create `adapter/api/auth_handler.go` — register/verify/resend/login/upgrade/me + `RequireAuth`.
- Create `adapter/api/auth_handler_test.go` — handler tests with in-memory fakes.
- Modify `main.go` — read auth/SMTP env, wire `AuthHandler`, mount `/api/v1/auth`.
- Modify `go.mod` / `go.sum` — add `golang-jwt/jwt/v5`, promote `x/crypto`.
- Modify `.env.example` — auth + SMTP vars.

**Python (`sugboway-ai-service/`)**
- Create `auth_quota.py` — tier limits + JWT verify + generalized limiter.
- Modify `main.py` — quota by token/tier in `/api/v1/chat`.
- Create `scripts/verify_auth.py` — smoke test.
- Modify `requirements.txt` — `PyJWT`.
- Modify `.env.example` — `AUTH_JWT_SECRET`.

**Web (`sugboway-web/`)**
- Create `src/lib/authApi.ts` — typed fetch helpers for the auth endpoints.
- Create `src/components/AuthProvider.tsx` — context + `useAuth()`.
- Create `src/components/auth/AuthModal.tsx` — login/register/verify UI.
- Create `src/components/auth/PricingPlans.tsx` — four pricing cards.
- Modify `src/app/layout.tsx` — wrap children in `AuthProvider`.
- Modify `src/app/page.tsx` — chat auth header, quota indicator, Profile rework, nudges.
- Modify `.env.example` — note (no new public vars; documents backend reqs).

---

## Phase A — Go backend (identity)

### Task 1: Users migration

**Files:**
- Create: `sugboway-routing-api/adapter/repository/migrations/0006_users_auth.sql`

**Interfaces:**
- Produces: a `users` table consumed by Task 5 (`PostgresUserStore`).

- [ ] **Step 1: Write the migration**

`sugboway-routing-api/adapter/repository/migrations/0006_users_auth.sql`:

```sql
-- Users for SugboWay authentication. Applied automatically on boot by the
-- embedded migrator (see adapter/repository/migrate.go).
CREATE TABLE IF NOT EXISTS users (
    id                       BIGSERIAL PRIMARY KEY,
    email                    TEXT NOT NULL UNIQUE,         -- stored lowercased
    password_hash            TEXT NOT NULL,                -- bcrypt
    tier                     TEXT NOT NULL DEFAULT 'free', -- free | pro | max
    email_verified           BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token_hash  TEXT,                         -- sha256 hex of the emailed token
    verification_expires_at  TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_verification_token_hash ON users (verification_token_hash);
```

- [ ] **Step 2: Verify it compiles into the binary**

Run: `cd sugboway-routing-api && go build ./...`
Expected: builds with no error (the `//go:embed migrations/*.sql` picks up the new file).

- [ ] **Step 3: Commit**

```bash
git add sugboway-routing-api/adapter/repository/migrations/0006_users_auth.sql
git commit -m "feat(routing-api): users table migration for auth"
```

---

### Task 2: Domain — passwords & tier limits (pure, TDD)

**Files:**
- Create: `sugboway-routing-api/domain/auth.go`
- Test: `sugboway-routing-api/domain/auth_test.go`
- Modify: `sugboway-routing-api/go.mod` (promote `golang.org/x/crypto`)

**Interfaces:**
- Produces: `HashPassword(string) (string, error)`, `CheckPassword(hash, pw string) bool`, `TierHourlyLimit(tier string) *int`.

- [ ] **Step 1: Write the failing test**

`sugboway-routing-api/domain/auth_test.go`:

```go
package domain

import "testing"

func TestHashAndCheckPassword(t *testing.T) {
	hash, err := HashPassword("sugbo123")
	if err != nil {
		t.Fatalf("hash error: %v", err)
	}
	if hash == "sugbo123" {
		t.Fatal("password was not hashed")
	}
	if !CheckPassword(hash, "sugbo123") {
		t.Error("correct password should verify")
	}
	if CheckPassword(hash, "wrong") {
		t.Error("wrong password should not verify")
	}
}

func TestTierHourlyLimit(t *testing.T) {
	if got := TierHourlyLimit("free"); got == nil || *got != 10 {
		t.Errorf("free => 10, got %v", got)
	}
	if got := TierHourlyLimit("pro"); got == nil || *got != 100 {
		t.Errorf("pro => 100, got %v", got)
	}
	if got := TierHourlyLimit("max"); got != nil {
		t.Errorf("max => unlimited(nil), got %v", got)
	}
	if got := TierHourlyLimit("garbage"); got == nil || *got != 10 {
		t.Errorf("unknown => free(10), got %v", got)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sugboway-routing-api && go test ./domain/ -run 'TestHashAndCheckPassword|TestTierHourlyLimit' -v`
Expected: FAIL — `undefined: HashPassword` (etc.).

- [ ] **Step 3: Write minimal implementation**

`sugboway-routing-api/domain/auth.go`:

```go
package domain

import "golang.org/x/crypto/bcrypt"

// HashPassword returns a bcrypt hash of the plaintext password.
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

// CheckPassword reports whether password matches the stored bcrypt hash.
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// TierHourlyLimit returns the per-hour AI-chat question limit for a tier.
// nil means unlimited. Unknown tiers fall back to the free limit.
func TierHourlyLimit(tier string) *int {
	switch tier {
	case "pro":
		n := 100
		return &n
	case "max":
		return nil
	default: // "free" and anything unexpected
		n := 10
		return &n
	}
}
```

- [ ] **Step 4: Tidy modules and run the test**

Run: `cd sugboway-routing-api && go mod tidy && go test ./domain/ -run 'TestHashAndCheckPassword|TestTierHourlyLimit' -v`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add sugboway-routing-api/domain/auth.go sugboway-routing-api/domain/auth_test.go sugboway-routing-api/go.mod sugboway-routing-api/go.sum
git commit -m "feat(routing-api): bcrypt passwords + tier limits"
```

---

### Task 3: Domain — verification tokens & JWT (pure, TDD)

**Files:**
- Modify: `sugboway-routing-api/domain/auth.go`
- Modify: `sugboway-routing-api/domain/auth_test.go`
- Modify: `sugboway-routing-api/go.mod` (add `github.com/golang-jwt/jwt/v5`)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `GenerateVerificationToken() (raw string, hash string, err error)`
  - `HashVerificationToken(raw string) string`
  - `type Claims struct { Email string; Tier string; jwt.RegisteredClaims }`
  - `IssueJWT(secret string, userID int64, email, tier string, ttl time.Duration) (string, error)`
  - `ParseJWT(secret, tokenStr string) (*Claims, error)`

- [ ] **Step 1: Add the dependency**

Run: `cd sugboway-routing-api && go get github.com/golang-jwt/jwt/v5@v5.2.1`
Expected: `go.mod` now requires `github.com/golang-jwt/jwt/v5`.

- [ ] **Step 2: Write the failing test**

Append to `sugboway-routing-api/domain/auth_test.go`:

```go
func TestVerificationTokenHashing(t *testing.T) {
	raw, hash, err := GenerateVerificationToken()
	if err != nil {
		t.Fatalf("gen error: %v", err)
	}
	if raw == "" || hash == "" || raw == hash {
		t.Fatal("expected distinct non-empty raw and hash")
	}
	if HashVerificationToken(raw) != hash {
		t.Error("re-hashing raw should equal the stored hash")
	}
}

func TestIssueAndParseJWT(t *testing.T) {
	secret := "test-secret"
	tok, err := IssueJWT(secret, 42, "a@b.com", "pro", time.Hour)
	if err != nil {
		t.Fatalf("issue error: %v", err)
	}
	claims, err := ParseJWT(secret, tok)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if claims.Subject != "42" || claims.Email != "a@b.com" || claims.Tier != "pro" {
		t.Errorf("unexpected claims: %+v", claims)
	}
	if _, err := ParseJWT("wrong-secret", tok); err == nil {
		t.Error("parsing with the wrong secret must fail")
	}
}

func TestParseJWTRejectsExpired(t *testing.T) {
	secret := "test-secret"
	tok, _ := IssueJWT(secret, 1, "a@b.com", "free", -time.Minute) // already expired
	if _, err := ParseJWT(secret, tok); err == nil {
		t.Error("expired token must fail to parse")
	}
}
```

Add the `"time"` import to the test file's import block (alongside `"testing"`).

- [ ] **Step 3: Run test to verify it fails**

Run: `cd sugboway-routing-api && go test ./domain/ -run 'TestVerificationTokenHashing|TestIssueAndParseJWT|TestParseJWTRejectsExpired' -v`
Expected: FAIL — `undefined: GenerateVerificationToken` (etc.).

- [ ] **Step 4: Write minimal implementation**

Append to `sugboway-routing-api/domain/auth.go` (and add imports `crypto/rand`, `crypto/sha256`, `encoding/hex`, `fmt`, `strconv`, `time`, and `github.com/golang-jwt/jwt/v5`):

```go
// GenerateVerificationToken returns a random token to email (raw) and the
// sha256 hex to store (hash). Only the hash is persisted.
func GenerateVerificationToken() (raw string, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	raw = hex.EncodeToString(b)
	return raw, HashVerificationToken(raw), nil
}

// HashVerificationToken returns the sha256 hex of a raw token, for lookup.
func HashVerificationToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// Claims is the JWT payload shared with the Python AI service.
type Claims struct {
	Email string `json:"email"`
	Tier  string `json:"tier"`
	jwt.RegisteredClaims
}

// IssueJWT signs an HS256 token carrying the user id, email, and tier.
func IssueJWT(secret string, userID int64, email, tier string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		Email: email,
		Tier:  tier,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(userID, 10),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

// ParseJWT verifies an HS256 token and returns its claims.
func ParseJWT(secret, tokenStr string) (*Claims, error) {
	claims := &Claims{}
	tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil || !tok.Valid {
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	return claims, nil
}
```

- [ ] **Step 5: Run the test**

Run: `cd sugboway-routing-api && go mod tidy && go test ./domain/ -v`
Expected: PASS (all auth tests, plus the existing fare/dijkstra tests still pass).

- [ ] **Step 6: Commit**

```bash
git add sugboway-routing-api/domain/auth.go sugboway-routing-api/domain/auth_test.go sugboway-routing-api/go.mod sugboway-routing-api/go.sum
git commit -m "feat(routing-api): verification tokens + HS256 JWT"
```

---

### Task 4: Ports — UserStore & EmailSender

**Files:**
- Modify: `sugboway-routing-api/domain/ports.go`

**Interfaces:**
- Produces (consumed by Tasks 5, 6):
  - `type User struct { ID int64; Email, PasswordHash, Tier string; EmailVerified bool }`
  - `UserStore` with `CreateUser`, `GetUserByEmail`, `MarkVerifiedByTokenHash`, `SetVerificationToken`, `UpdateTier`.
  - `EmailSender` with `SendVerification`.

- [ ] **Step 1: Add the interfaces**

Append to `sugboway-routing-api/domain/ports.go` (add imports `"context"` and `"time"` to the file's import block — currently the file has no import block, so add one after `package domain`):

```go
import (
	"context"
	"time"
)

// User is an authenticated account.
type User struct {
	ID            int64
	Email         string
	PasswordHash  string
	Tier          string
	EmailVerified bool
}

// UserStore persists users. Implemented by the Postgres adapter; faked in tests.
type UserStore interface {
	// CreateUser inserts a new unverified user. Returns an error if the email
	// already exists.
	CreateUser(ctx context.Context, email, passwordHash, verificationTokenHash string, verificationExpiresAt time.Time) (*User, error)
	// GetUserByEmail returns the user, or (nil, nil) if none exists.
	GetUserByEmail(ctx context.Context, email string) (*User, error)
	// MarkVerifiedByTokenHash verifies the user holding an unexpired token hash.
	// Returns true if a row was verified.
	MarkVerifiedByTokenHash(ctx context.Context, tokenHash string) (bool, error)
	// SetVerificationToken refreshes the token for an existing UNVERIFIED user.
	// Returns true if such a user existed and was updated.
	SetVerificationToken(ctx context.Context, email, tokenHash string, expiresAt time.Time) (bool, error)
	// UpdateTier sets a user's plan tier.
	UpdateTier(ctx context.Context, userID int64, tier string) error
}

// EmailSender sends transactional email. Implemented by the SMTP adapter.
type EmailSender interface {
	SendVerification(ctx context.Context, toEmail, verifyURL string) error
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd sugboway-routing-api && go build ./...`
Expected: builds with no error.

- [ ] **Step 3: Commit**

```bash
git add sugboway-routing-api/domain/ports.go
git commit -m "feat(routing-api): UserStore + EmailSender ports"
```

---

### Task 5: Postgres UserStore adapter

**Files:**
- Create: `sugboway-routing-api/adapter/repository/users.go`

**Interfaces:**
- Consumes: `domain.User`, `domain.UserStore` (Task 4); `*pgxpool.Pool` (existing `PostgresSpatialRepository.Pool`).
- Produces: `NewPostgresUserStore(pool *pgxpool.Pool) *PostgresUserStore` implementing `domain.UserStore`.

> No DB-integration test here (the repo has none for Postgres; handler logic is covered with a fake in Task 6). Correctness is verified by `go build` + `go vet` and the live boot in Task 6.

- [ ] **Step 1: Implement the adapter**

`sugboway-routing-api/adapter/repository/users.go`:

```go
package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"sugboway-routing-api/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresUserStore implements domain.UserStore over the shared pgx pool.
type PostgresUserStore struct {
	Pool *pgxpool.Pool
}

// NewPostgresUserStore builds a user store sharing an existing pool.
func NewPostgresUserStore(pool *pgxpool.Pool) *PostgresUserStore {
	return &PostgresUserStore{Pool: pool}
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func (s *PostgresUserStore) CreateUser(ctx context.Context, email, passwordHash, tokenHash string, expiresAt time.Time) (*domain.User, error) {
	email = normalizeEmail(email)
	const q = `
		INSERT INTO users (email, password_hash, verification_token_hash, verification_expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id, email, password_hash, tier, email_verified`
	u := &domain.User{}
	err := s.Pool.QueryRow(ctx, q, email, passwordHash, tokenHash, expiresAt).
		Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Tier, &u.EmailVerified)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *PostgresUserStore) GetUserByEmail(ctx context.Context, email string) (*domain.User, error) {
	email = normalizeEmail(email)
	const q = `
		SELECT id, email, password_hash, tier, email_verified
		FROM users WHERE email = $1`
	u := &domain.User{}
	err := s.Pool.QueryRow(ctx, q, email).
		Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Tier, &u.EmailVerified)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *PostgresUserStore) MarkVerifiedByTokenHash(ctx context.Context, tokenHash string) (bool, error) {
	const q = `
		UPDATE users
		SET email_verified = TRUE,
		    verification_token_hash = NULL,
		    verification_expires_at = NULL,
		    updated_at = now()
		WHERE verification_token_hash = $1
		  AND email_verified = FALSE
		  AND verification_expires_at > now()`
	tag, err := s.Pool.Exec(ctx, q, tokenHash)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (s *PostgresUserStore) SetVerificationToken(ctx context.Context, email, tokenHash string, expiresAt time.Time) (bool, error) {
	email = normalizeEmail(email)
	const q = `
		UPDATE users
		SET verification_token_hash = $2,
		    verification_expires_at = $3,
		    updated_at = now()
		WHERE email = $1 AND email_verified = FALSE`
	tag, err := s.Pool.Exec(ctx, q, email, tokenHash, expiresAt)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (s *PostgresUserStore) UpdateTier(ctx context.Context, userID int64, tier string) error {
	const q = `UPDATE users SET tier = $2, updated_at = now() WHERE id = $1`
	_, err := s.Pool.Exec(ctx, q, userID, tier)
	return err
}
```

- [ ] **Step 2: Build and vet**

Run: `cd sugboway-routing-api && go build ./... && go vet ./adapter/repository/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add sugboway-routing-api/adapter/repository/users.go
git commit -m "feat(routing-api): Postgres UserStore adapter"
```

---

### Task 6: Auth handlers + SMTP sender + wiring (TDD with fakes)

**Files:**
- Create: `sugboway-routing-api/adapter/email/smtp.go`
- Create: `sugboway-routing-api/adapter/api/auth_handler.go`
- Create: `sugboway-routing-api/adapter/api/auth_handler_test.go`
- Modify: `sugboway-routing-api/main.go`

**Interfaces:**
- Consumes: `domain.UserStore`, `domain.EmailSender`, `domain.User`, `HashPassword`, `CheckPassword`, `GenerateVerificationToken`, `HashVerificationToken`, `IssueJWT`, `ParseJWT` (Tasks 2–4); `NewPostgresUserStore` (Task 5).
- Produces:
  - `NewAuthHandler(store domain.UserStore, email domain.EmailSender, cfg AuthConfig) *AuthHandler`
  - `type AuthConfig struct { JWTSecret, AppBaseURL, PublicAPIURL string; TokenTTL, VerifyTTL time.Duration }`
  - Methods `Register`, `Verify`, `Resend`, `Login`, `Upgrade`, `Me`, and middleware `RequireAuth`.
  - `email.NewSMTPSender(host, port, user, pass, from string) *email.SMTPSender`.

- [ ] **Step 1: Implement the SMTP sender**

`sugboway-routing-api/adapter/email/smtp.go`:

```go
package email

import (
	"context"
	"fmt"
	"net/smtp"
)

// SMTPSender sends verification email via a standard SMTP server.
type SMTPSender struct {
	Host string
	Port string
	User string
	Pass string
	From string
}

// NewSMTPSender constructs an SMTP-backed email sender.
func NewSMTPSender(host, port, user, pass, from string) *SMTPSender {
	return &SMTPSender{Host: host, Port: port, User: user, Pass: pass, From: from}
}

// SendVerification emails a verification link to the recipient.
func (s *SMTPSender) SendVerification(_ context.Context, to, verifyURL string) error {
	subject := "Verify your SugboWay account"
	body := fmt.Sprintf(
		"Maayong adlaw!\r\n\r\n"+
			"Confirm your SugboWay account by opening this link:\r\n%s\r\n\r\n"+
			"The link expires in 24 hours. If you didn't sign up, ignore this email.\r\n\r\n"+
			"— SugboWay, Cebu transit made simple",
		verifyURL,
	)
	msg := []byte(fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		s.From, to, subject, body,
	))
	auth := smtp.PlainAuth("", s.User, s.Pass, s.Host)
	addr := s.Host + ":" + s.Port
	return smtp.SendMail(addr, auth, s.From, []string{to}, msg)
}
```

- [ ] **Step 2: Write the failing handler tests**

`sugboway-routing-api/adapter/api/auth_handler_test.go`:

```go
package api

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"sugboway-routing-api/domain"

	"github.com/gofiber/fiber/v2"
)

// --- in-memory fakes ---

type fakeStore struct {
	users      map[string]*domain.User // by email
	nextID     int64
	tokenByHsh map[string]string // tokenHash -> email
}

func newFakeStore() *fakeStore {
	return &fakeStore{users: map[string]*domain.User{}, tokenByHsh: map[string]string{}, nextID: 0}
}

func (f *fakeStore) CreateUser(_ context.Context, email, hash, tokenHash string, _ time.Time) (*domain.User, error) {
	email = strings.ToLower(email)
	if _, ok := f.users[email]; ok {
		return nil, fiber.NewError(409, "exists")
	}
	f.nextID++
	u := &domain.User{ID: f.nextID, Email: email, PasswordHash: hash, Tier: "free", EmailVerified: false}
	f.users[email] = u
	f.tokenByHsh[tokenHash] = email
	return u, nil
}
func (f *fakeStore) GetUserByEmail(_ context.Context, email string) (*domain.User, error) {
	return f.users[strings.ToLower(email)], nil
}
func (f *fakeStore) MarkVerifiedByTokenHash(_ context.Context, tokenHash string) (bool, error) {
	email, ok := f.tokenByHsh[tokenHash]
	if !ok {
		return false, nil
	}
	f.users[email].EmailVerified = true
	delete(f.tokenByHsh, tokenHash)
	return true, nil
}
func (f *fakeStore) SetVerificationToken(_ context.Context, email, tokenHash string, _ time.Time) (bool, error) {
	email = strings.ToLower(email)
	u, ok := f.users[email]
	if !ok || u.EmailVerified {
		return false, nil
	}
	f.tokenByHsh[tokenHash] = email
	return true, nil
}
func (f *fakeStore) UpdateTier(_ context.Context, id int64, tier string) error {
	for _, u := range f.users {
		if u.ID == id {
			u.Tier = tier
		}
	}
	return nil
}

type fakeEmail struct{ lastURL string }

func (e *fakeEmail) SendVerification(_ context.Context, _ string, url string) error {
	e.lastURL = url
	return nil
}

func testApp(store domain.UserStore, mail domain.EmailSender) (*fiber.App, *AuthHandler) {
	h := NewAuthHandler(store, mail, AuthConfig{
		JWTSecret: "test-secret", AppBaseURL: "http://web", PublicAPIURL: "http://api",
		TokenTTL: time.Hour, VerifyTTL: 24 * time.Hour,
	})
	app := fiber.New()
	g := app.Group("/api/v1/auth")
	g.Post("/register", h.Register)
	g.Get("/verify", h.Verify)
	g.Post("/resend", h.Resend)
	g.Post("/login", h.Login)
	g.Post("/upgrade", h.RequireAuth, h.Upgrade)
	g.Get("/me", h.RequireAuth, h.Me)
	return app, h
}

func doJSON(t *testing.T, app *fiber.App, method, path, body, bearer string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

// --- tests ---

func TestRegisterThenLoginBlockedUntilVerified(t *testing.T) {
	store := newFakeStore()
	mail := &fakeEmail{}
	app, _ := testApp(store, mail)

	code, _ := doJSON(t, app, "POST", "/api/v1/auth/register", `{"email":"a@b.com","password":"sugbo123"}`, "")
	if code != 202 {
		t.Fatalf("register => 202, got %d", code)
	}
	if mail.lastURL == "" || !strings.Contains(mail.lastURL, "/api/v1/auth/verify?token=") {
		t.Fatalf("expected a verify URL, got %q", mail.lastURL)
	}

	// login before verifying => 403
	code, out := doJSON(t, app, "POST", "/api/v1/auth/login", `{"email":"a@b.com","password":"sugbo123"}`, "")
	if code != 403 || out["error"] != "email_not_verified" {
		t.Fatalf("login before verify => 403 email_not_verified, got %d %v", code, out)
	}

	// verify via the emailed link
	token := mail.lastURL[strings.Index(mail.lastURL, "token=")+len("token="):]
	code, _ = doJSON(t, app, "GET", "/api/v1/auth/verify?token="+token, "", "")
	if code != 302 {
		t.Fatalf("verify => 302 redirect, got %d", code)
	}

	// login now succeeds with a token
	code, out = doJSON(t, app, "POST", "/api/v1/auth/login", `{"email":"a@b.com","password":"sugbo123"}`, "")
	if code != 200 || out["token"] == nil {
		t.Fatalf("login after verify => 200 + token, got %d %v", code, out)
	}
}

func TestRegisterDuplicateEmail(t *testing.T) {
	store := newFakeStore()
	app, _ := testApp(store, &fakeEmail{})
	doJSON(t, app, "POST", "/api/v1/auth/register", `{"email":"a@b.com","password":"sugbo123"}`, "")
	code, _ := doJSON(t, app, "POST", "/api/v1/auth/register", `{"email":"a@b.com","password":"sugbo123"}`, "")
	if code != 409 {
		t.Fatalf("duplicate => 409, got %d", code)
	}
}

func TestLoginWrongPassword(t *testing.T) {
	store := newFakeStore()
	mail := &fakeEmail{}
	app, _ := testApp(store, mail)
	doJSON(t, app, "POST", "/api/v1/auth/register", `{"email":"a@b.com","password":"sugbo123"}`, "")
	token := mail.lastURL[strings.Index(mail.lastURL, "token=")+len("token="):]
	doJSON(t, app, "GET", "/api/v1/auth/verify?token="+token, "", "")
	code, out := doJSON(t, app, "POST", "/api/v1/auth/login", `{"email":"a@b.com","password":"nope"}`, "")
	if code != 401 || out["error"] != "invalid_credentials" {
		t.Fatalf("wrong password => 401 invalid_credentials, got %d %v", code, out)
	}
}

func TestUpgradeRequiresAuthAndRaisesTier(t *testing.T) {
	store := newFakeStore()
	mail := &fakeEmail{}
	app, _ := testApp(store, mail)
	doJSON(t, app, "POST", "/api/v1/auth/register", `{"email":"a@b.com","password":"sugbo123"}`, "")
	token := mail.lastURL[strings.Index(mail.lastURL, "token=")+len("token="):]
	doJSON(t, app, "GET", "/api/v1/auth/verify?token="+token, "", "")
	_, out := doJSON(t, app, "POST", "/api/v1/auth/login", `{"email":"a@b.com","password":"sugbo123"}`, "")
	jwtTok, _ := out["token"].(string)

	// no auth => 401
	code, _ := doJSON(t, app, "POST", "/api/v1/auth/upgrade", `{"plan":"pro"}`, "")
	if code != 401 {
		t.Fatalf("upgrade without auth => 401, got %d", code)
	}
	// with auth => 200 and tier pro
	code, out = doJSON(t, app, "POST", "/api/v1/auth/upgrade", `{"plan":"pro"}`, jwtTok)
	if code != 200 {
		t.Fatalf("upgrade => 200, got %d", code)
	}
	user, _ := out["user"].(map[string]any)
	if user["tier"] != "pro" {
		t.Fatalf("tier => pro, got %v", out["user"])
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd sugboway-routing-api && go test ./adapter/api/ -run TestRegister -v`
Expected: FAIL — `undefined: NewAuthHandler` / `AuthConfig` / `AuthHandler`.

- [ ] **Step 4: Implement the handler**

`sugboway-routing-api/adapter/api/auth_handler.go`:

```go
package api

import (
	"strconv"
	"strings"
	"time"

	"sugboway-routing-api/domain"

	"github.com/gofiber/fiber/v2"
)

// AuthConfig holds the auth handler's runtime configuration.
type AuthConfig struct {
	JWTSecret    string
	AppBaseURL   string        // web origin, for the post-verify redirect
	PublicAPIURL string        // this API's public origin, for the email link
	TokenTTL     time.Duration // JWT lifetime
	VerifyTTL    time.Duration // verification-token lifetime
}

// AuthHandler serves the /api/v1/auth endpoints.
type AuthHandler struct {
	store domain.UserStore
	email domain.EmailSender
	cfg   AuthConfig
}

// NewAuthHandler builds an auth handler.
func NewAuthHandler(store domain.UserStore, email domain.EmailSender, cfg AuthConfig) *AuthHandler {
	return &AuthHandler{store: store, email: email, cfg: cfg}
}

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func validEmail(e string) bool {
	return strings.Contains(e, "@") && strings.Contains(e, ".") && len(e) <= 254
}

func userJSON(u *domain.User) fiber.Map {
	return fiber.Map{"email": u.Email, "tier": u.Tier}
}

// Register creates an unverified user and emails a verification link.
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var in credentials
	if err := c.BodyParser(&in); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if !validEmail(in.Email) {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_email"})
	}
	if len(in.Password) < 8 {
		return c.Status(400).JSON(fiber.Map{"error": "weak_password"})
	}
	if existing, _ := h.store.GetUserByEmail(c.Context(), in.Email); existing != nil {
		return c.Status(409).JSON(fiber.Map{"error": "email_taken"})
	}
	hash, err := domain.HashPassword(in.Password)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "hash_failed"})
	}
	raw, tokenHash, err := domain.GenerateVerificationToken()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "token_failed"})
	}
	if _, err := h.store.CreateUser(c.Context(), in.Email, hash, tokenHash, time.Now().Add(h.cfg.VerifyTTL)); err != nil {
		return c.Status(409).JSON(fiber.Map{"error": "email_taken"})
	}
	emailSent := true
	if err := h.email.SendVerification(c.Context(), in.Email, h.verifyURL(raw)); err != nil {
		emailSent = false
	}
	return c.Status(202).JSON(fiber.Map{"status": "verify_email", "email_sent": emailSent})
}

func (h *AuthHandler) verifyURL(rawToken string) string {
	return h.cfg.PublicAPIURL + "/api/v1/auth/verify?token=" + rawToken
}

// Verify marks the account verified and redirects to the web app.
func (h *AuthHandler) Verify(c *fiber.Ctx) error {
	raw := c.Query("token")
	ok := false
	if raw != "" {
		if verified, err := h.store.MarkVerifiedByTokenHash(c.Context(), domain.HashVerificationToken(raw)); err == nil {
			ok = verified
		}
	}
	dest := h.cfg.AppBaseURL + "/?verified=0"
	if ok {
		dest = h.cfg.AppBaseURL + "/?verified=1"
	}
	return c.Redirect(dest, fiber.StatusFound)
}

// Resend regenerates and re-sends a verification email. Always 200 (no enumeration).
func (h *AuthHandler) Resend(c *fiber.Ctx) error {
	var in credentials
	if err := c.BodyParser(&in); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	raw, tokenHash, err := domain.GenerateVerificationToken()
	if err == nil {
		if updated, _ := h.store.SetVerificationToken(c.Context(), in.Email, tokenHash, time.Now().Add(h.cfg.VerifyTTL)); updated {
			_ = h.email.SendVerification(c.Context(), in.Email, h.verifyURL(raw))
		}
	}
	return c.Status(200).JSON(fiber.Map{"status": "ok"})
}

// Login issues a JWT for verified users only.
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var in credentials
	if err := c.BodyParser(&in); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	u, _ := h.store.GetUserByEmail(c.Context(), in.Email)
	if u == nil || !domain.CheckPassword(u.PasswordHash, in.Password) {
		return c.Status(401).JSON(fiber.Map{"error": "invalid_credentials"})
	}
	if !u.EmailVerified {
		return c.Status(403).JSON(fiber.Map{"error": "email_not_verified"})
	}
	return h.issue(c, u)
}

func (h *AuthHandler) issue(c *fiber.Ctx, u *domain.User) error {
	tok, err := domain.IssueJWT(h.cfg.JWTSecret, u.ID, u.Email, u.Tier, h.cfg.TokenTTL)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "token_failed"})
	}
	return c.Status(200).JSON(fiber.Map{"token": tok, "user": userJSON(u)})
}

// Upgrade (demo) sets the caller's tier and returns a fresh token.
func (h *AuthHandler) Upgrade(c *fiber.Ctx) error {
	var in struct {
		Plan string `json:"plan"`
	}
	if err := c.BodyParser(&in); err != nil || (in.Plan != "pro" && in.Plan != "max") {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_plan"})
	}
	claims := c.Locals("claims").(*domain.Claims)
	userID, _ := strconv.ParseInt(claims.Subject, 10, 64)
	if err := h.store.UpdateTier(c.Context(), userID, in.Plan); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "update_failed"})
	}
	return h.issue(c, &domain.User{ID: userID, Email: claims.Email, Tier: in.Plan})
}

// Me returns the caller's account summary.
func (h *AuthHandler) Me(c *fiber.Ctx) error {
	claims := c.Locals("claims").(*domain.Claims)
	return c.Status(200).JSON(fiber.Map{"email": claims.Email, "tier": claims.Tier})
}

// RequireAuth validates the Bearer JWT and stores claims in c.Locals("claims").
func (h *AuthHandler) RequireAuth(c *fiber.Ctx) error {
	authz := c.Get("Authorization")
	const p = "Bearer "
	if !strings.HasPrefix(authz, p) {
		return c.Status(401).JSON(fiber.Map{"error": "missing_token"})
	}
	claims, err := domain.ParseJWT(h.cfg.JWTSecret, strings.TrimPrefix(authz, p))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "invalid_token"})
	}
	c.Locals("claims", claims)
	return c.Next()
}
```

- [ ] **Step 5: Run the handler tests**

Run: `cd sugboway-routing-api && go test ./adapter/api/ -v`
Expected: PASS (all four auth handler tests).

- [ ] **Step 6: Wire it in `main.go`**

In `sugboway-routing-api/main.go`, add the import `"sugboway-routing-api/adapter/email"` (`os`, `log`, and `time` are already imported). After the existing handler wiring (after `routingHandler := api.NewRoutingHandler(...)`, around line 58) add:

```go
	// Auth: config from env (shared JWT secret with the AI service).
	jwtSecret := os.Getenv("AUTH_JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "dev-insecure-secret-change-me"
		log.Println("[SugboWay Routing API] WARNING: AUTH_JWT_SECRET not set — using an insecure dev default. Set it in production.")
	}
	appBaseURL := envOr("APP_BASE_URL", "http://localhost:3000")
	publicAPIURL := envOr("PUBLIC_API_URL", "http://localhost:8080")

	userStore := repository.NewPostgresUserStore(repo.Pool)
	mailSender := email.NewSMTPSender(
		os.Getenv("SMTP_HOST"), envOr("SMTP_PORT", "587"),
		os.Getenv("SMTP_USER"), os.Getenv("SMTP_PASS"),
		envOr("SMTP_FROM", "SugboWay <no-reply@sugboway.app>"),
	)
	authHandler := api.NewAuthHandler(userStore, mailSender, api.AuthConfig{
		JWTSecret: jwtSecret, AppBaseURL: appBaseURL, PublicAPIURL: publicAPIURL,
		TokenTTL: 7 * 24 * time.Hour, VerifyTTL: 24 * time.Hour,
	})
```

Then, after the existing `apiGroup` route bindings (after the `/route/conductor` line, ~line 85) add:

```go
	authGroup := app.Group("/api/v1/auth")
	authGroup.Post("/register", authHandler.Register)
	authGroup.Get("/verify", authHandler.Verify)
	authGroup.Post("/resend", authHandler.Resend)
	authGroup.Post("/login", authHandler.Login)
	authGroup.Post("/upgrade", authHandler.RequireAuth, authHandler.Upgrade)
	authGroup.Get("/me", authHandler.RequireAuth, authHandler.Me)
```

Add this small helper at the bottom of `main.go` (outside `main`):

```go
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 7: Build the whole service**

Run: `cd sugboway-routing-api && go build ./... && go test ./...`
Expected: builds; all tests pass (domain + adapter/api).

- [ ] **Step 8: Commit**

```bash
git add sugboway-routing-api/adapter/email/smtp.go sugboway-routing-api/adapter/api/auth_handler.go sugboway-routing-api/adapter/api/auth_handler_test.go sugboway-routing-api/main.go
git commit -m "feat(routing-api): auth endpoints (register/verify/login/upgrade) + SMTP"
```

---

## Phase B — Python quota enforcement

### Task 7: Tier limits + JWT verify module (TDD via verify script)

**Files:**
- Create: `sugboway-ai-service/auth_quota.py`
- Create: `sugboway-ai-service/scripts/verify_auth.py`
- Modify: `sugboway-ai-service/requirements.txt`

**Interfaces:**
- Produces:
  - `TIER_LIMITS = {"free": 10, "pro": 100, "max": None}`, `GUEST_LIMIT = 5`
  - `verify_token(token: str) -> dict` → `{"user_id": str, "tier": str}`; raises on invalid.
  - `tier_limit(tier: str) -> int | None` (None = unlimited)

- [ ] **Step 1: Add the dependency**

Append to `sugboway-ai-service/requirements.txt`:

```
PyJWT>=2.8.0
```

Run: `cd sugboway-ai-service && pip install -r requirements.txt`
Expected: PyJWT installs.

- [ ] **Step 2: Implement the module**

`sugboway-ai-service/auth_quota.py`:

```python
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
```

- [ ] **Step 3: Write the verify script (acts as the test)**

`sugboway-ai-service/scripts/verify_auth.py`:

```python
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
```

- [ ] **Step 4: Run the script**

Run: `cd sugboway-ai-service && python scripts/verify_auth.py`
Expected: prints `verify_auth: OK`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add sugboway-ai-service/auth_quota.py sugboway-ai-service/scripts/verify_auth.py sugboway-ai-service/requirements.txt
git commit -m "feat(ai-service): JWT verify + per-tier quota limits"
```

---

### Task 8: Enforce per-user quota in /chat

**Files:**
- Modify: `sugboway-ai-service/main.py`

**Interfaces:**
- Consumes: `auth_quota.verify_token`, `auth_quota.tier_limit`, `auth_quota.GUEST_LIMIT` (Task 7).
- Produces: `/api/v1/chat` responses now include `tier` and `remaining`; guests unchanged at 5/IP.

- [ ] **Step 1: Generalize the limiter**

In `sugboway-ai-service/main.py`, replace the `check_ip_rate_limit` function (the `def check_ip_rate_limit(...)` block) with a key+limit version:

```python
def check_rate_limit(key: str, limit) -> tuple[bool, int, int]:
    """Sliding-window limiter. `limit` None means unlimited.
    Returns (is_limited, remaining, reset_seconds)."""
    if limit is None:
        return False, 999999, 0
    now = time.time()
    one_hour_ago = now - 3600
    timestamps = [t for t in _rate_limit_store[key] if t > one_hour_ago]
    _rate_limit_store[key] = timestamps
    if len(timestamps) >= limit:
        oldest = timestamps[0]
        return True, 0, max(1, int(oldest + 3600 - now))
    timestamps.append(now)
    _rate_limit_store[key] = timestamps
    return False, limit - len(timestamps), 0
```

- [ ] **Step 2: Identify the caller and pick the limit in the chat endpoint**

In `sugboway-ai-service/main.py`, add the import near the top (after `from dotenv import load_dotenv`):

```python
import auth_quota
```

Then, inside `chat_endpoint`, replace the body from the client-IP line through the rate-limit check with:

```python
    client_ip = raw_request.client.host if raw_request.client else "127.0.0.1"

    # Identify the caller: a valid Bearer token => per-user tier limit;
    # otherwise => guest (5/hour per IP). A present-but-invalid token => 401.
    tier = "guest"
    rate_key = f"ip:{client_ip}"
    limit = auth_quota.GUEST_LIMIT
    authz = raw_request.headers.get("Authorization", "")
    if authz.startswith("Bearer "):
        try:
            claims = auth_quota.verify_token(authz[len("Bearer "):])
            tier = claims["tier"]
            rate_key = f"user:{claims['user_id']}"
            limit = auth_quota.tier_limit(tier)
        except Exception:
            return JSONResponse(status_code=401, content={"error": "invalid_token"})

    is_limited, remaining, reset_seconds = check_rate_limit(rate_key, limit)
    if is_limited:
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limited",
                "message": "You've reached your hourly question limit.",
                "remaining": 0,
                "reset_seconds": reset_seconds,
                "tier": tier,
            },
        )
```

Then update the success response (the `JSONResponse(content={"reply": reply, "remaining": remaining})` block) to include the tier:

```python
        response = JSONResponse(content={"reply": reply, "remaining": remaining, "tier": tier})
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = "3600"
        return response
```

- [ ] **Step 3: Smoke-test the service boots and guests still work**

Run: `cd sugboway-ai-service && python -c "import main; print('import ok')"`
Expected: prints `import ok` with no import/syntax error. (A full request test needs the DB + Gemini key; guest path is unchanged logic.)

- [ ] **Step 4: Commit**

```bash
git add sugboway-ai-service/main.py
git commit -m "feat(ai-service): per-user tier quota in /chat (guests unchanged)"
```

---

## Phase C — Web

### Task 9: Auth API client + provider/hook

**Files:**
- Create: `sugboway-web/src/lib/authApi.ts`
- Create: `sugboway-web/src/components/AuthProvider.tsx`
- Modify: `sugboway-web/src/app/layout.tsx`

**Interfaces:**
- Produces:
  - `authApi` with `register`, `login`, `resend`, `upgrade`, `me` (typed).
  - `useAuth()` → `{ user, token, isAuthed, register, login, resend, logout, upgrade }`.
  - `type Tier = "free" | "pro" | "max"`, `interface AuthUser { email: string; tier: Tier }`.

- [ ] **Step 1: Implement the API client**

`sugboway-web/src/lib/authApi.ts`:

```ts
const BASE = process.env.NEXT_PUBLIC_ROUTING_API_URL ?? "http://localhost:8080";

export type Tier = "free" | "pro" | "max";
export interface AuthUser {
  email: string;
  tier: Tier;
}

interface LoginResult {
  ok: boolean;
  token?: string;
  user?: AuthUser;
  needsVerification?: boolean;
  error?: string;
}
interface RegisterResult {
  ok: boolean;
  emailSent?: boolean;
  error?: string;
}

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${BASE}/api/v1/auth${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export const authApi = {
  async register(email: string, password: string): Promise<RegisterResult> {
    const { status, data } = await post("/register", { email, password });
    if (status === 202) return { ok: true, emailSent: data.email_sent !== false };
    return { ok: false, error: data.error ?? "register_failed" };
  },

  async login(email: string, password: string): Promise<LoginResult> {
    const { status, data } = await post("/login", { email, password });
    if (status === 200) return { ok: true, token: data.token, user: data.user };
    if (status === 403 && data.error === "email_not_verified")
      return { ok: false, needsVerification: true, error: data.error };
    return { ok: false, error: data.error ?? "login_failed" };
  },

  async resend(email: string): Promise<void> {
    await post("/resend", { email });
  },

  async upgrade(plan: "pro" | "max", token: string): Promise<LoginResult> {
    const { status, data } = await post("/upgrade", { plan }, token);
    if (status === 200) return { ok: true, token: data.token, user: data.user };
    return { ok: false, error: data.error ?? "upgrade_failed" };
  },
};
```

- [ ] **Step 2: Implement the provider/hook**

`sugboway-web/src/components/AuthProvider.tsx`:

```tsx
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi, type AuthUser } from "@/lib/authApi";

const TOKEN_KEY = "sugboway-auth-token";
const USER_KEY = "sugboway-auth-user";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthed: boolean;
  register: (email: string, password: string) => Promise<{ ok: boolean; emailSent?: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ ok: boolean; needsVerification?: boolean; error?: string }>;
  resend: (email: string) => Promise<void>;
  logout: () => void;
  upgrade: (plan: "pro" | "max") => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isAuthed: false,
  register: async () => ({ ok: false }),
  login: async () => ({ ok: false }),
  resend: async () => {},
  logout: () => {},
  upgrade: async () => ({ ok: false }),
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Restore session on mount.
  useEffect(() => {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      const u = localStorage.getItem(USER_KEY);
      if (t && u) {
        setToken(t);
        setUser(JSON.parse(u) as AuthUser);
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  const persist = useCallback((t: string, u: AuthUser) => {
    setToken(t);
    setUser(u);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const r = await authApi.register(email, password);
    return { ok: r.ok, emailSent: r.emailSent, error: r.error };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await authApi.login(email, password);
    if (r.ok && r.token && r.user) persist(r.token, r.user);
    return { ok: r.ok, needsVerification: r.needsVerification, error: r.error };
  }, [persist]);

  const resend = useCallback(async (email: string) => {
    await authApi.resend(email);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const upgrade = useCallback(async (plan: "pro" | "max") => {
    if (!token) return { ok: false, error: "not_authenticated" };
    const r = await authApi.upgrade(plan, token);
    if (r.ok && r.token && r.user) persist(r.token, r.user);
    return { ok: r.ok, error: r.error };
  }, [token, persist]);

  return (
    <AuthContext.Provider value={{ user, token, isAuthed: !!token, register, login, resend, logout, upgrade }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 3: Wrap the app**

In `sugboway-web/src/app/layout.tsx`, import the provider and wrap children:

```tsx
import AuthProvider from "@/components/AuthProvider";
```

Change the body content from:

```tsx
        <SplashScreen />
        <ThemeProvider>{children}</ThemeProvider>
```

to:

```tsx
        <SplashScreen />
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
```

- [ ] **Step 4: Lint + type-check**

Run: `cd sugboway-web && npx tsc --noEmit && npm run lint`
Expected: no type errors; lint passes.

- [ ] **Step 5: Commit**

```bash
git add sugboway-web/src/lib/authApi.ts sugboway-web/src/components/AuthProvider.tsx sugboway-web/src/app/layout.tsx
git commit -m "feat(web): auth API client + AuthProvider/useAuth"
```

---

### Task 10: AuthModal component

**Files:**
- Create: `sugboway-web/src/components/auth/AuthModal.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 9).
- Produces: `AuthModal` with props `{ open: boolean; onClose: () => void; initialMode?: "login" | "register" }`.

- [ ] **Step 1: Implement the modal**

`sugboway-web/src/components/auth/AuthModal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

type Mode = "login" | "register" | "check-email";

interface Props {
  open: boolean;
  onClose: () => void;
  initialMode?: "login" | "register";
}

const AuthModal = ({ open, onClose, initialMode = "login" }: Props) => {
  const { login, register, resend } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setPassword("");
    }
  }, [open, initialMode]);

  if (!open) return null;

  const friendly: Record<string, string> = {
    invalid_credentials: "Email or password is incorrect.",
    email_taken: "That email is already registered. Try signing in.",
    weak_password: "Use at least 8 characters.",
    invalid_email: "Enter a valid email address.",
    email_not_verified: "Please verify your email first.",
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    if (mode === "register") {
      const r = await register(email, password);
      if (r.ok) setMode("check-email");
      else setError(friendly[r.error ?? ""] ?? "Something went wrong. Try again.");
    } else {
      const r = await login(email, password);
      if (r.ok) onClose();
      else if (r.needsVerification) setMode("check-email");
      else setError(friendly[r.error ?? ""] ?? "Something went wrong. Try again.");
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 space-y-4 animate-[fadeIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "check-email" ? (
          <div className="text-center space-y-3">
            <span className="material-symbols-outlined text-cebu-blue text-4xl">mark_email_unread</span>
            <h2 className="text-lg font-bold text-on-surface">Check your email</h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              We sent a verification link to <span className="font-semibold">{email}</span>. Open it, then sign in.
            </p>
            <button
              onClick={() => resend(email)}
              className="text-sm font-semibold text-cebu-blue hover:underline"
            >
              Resend email
            </button>
            <button
              onClick={() => setMode("login")}
              className="block w-full mt-2 bg-cebu-blue text-white font-semibold text-sm py-2.5 rounded-xl active:scale-95 transition-transform"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-on-surface">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h2>
              <button onClick={onClose} aria-label="Close" className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-on-surface-variant">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error}
                  className="mt-1 w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-cebu-blue"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-on-surface-variant">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  aria-invalid={!!error}
                  className="mt-1 w-full bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-cebu-blue"
                  placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
                />
              </label>

              {error && <p className="text-xs text-error font-medium">{error}</p>}

              <button
                onClick={submit}
                disabled={busy}
                className="w-full bg-cebu-blue text-white font-semibold text-sm py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-60"
              >
                {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </div>

            <p className="text-xs text-center text-on-surface-variant">
              {mode === "login" ? "New to SugboWay? " : "Already have an account? "}
              <button
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError(null);
                }}
                className="font-semibold text-cebu-blue hover:underline"
              >
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
```

- [ ] **Step 2: Lint + type-check**

Run: `cd sugboway-web && npx tsc --noEmit && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add sugboway-web/src/components/auth/AuthModal.tsx
git commit -m "feat(web): login/register/verify auth modal"
```

---

### Task 11: PricingPlans component

**Files:**
- Create: `sugboway-web/src/components/auth/PricingPlans.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 9).
- Produces: `PricingPlans` with props `{ onRequireAuth: () => void }`.

- [ ] **Step 1: Implement the pricing cards**

`sugboway-web/src/components/auth/PricingPlans.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

interface Plan {
  id: "guest" | "free" | "pro" | "max";
  name: string;
  price: string;
  quota: string;
  perks: string[];
  upgradeTo?: "pro" | "max";
}

const PLANS: Plan[] = [
  { id: "guest", name: "Guest", price: "—", quota: "5 questions / hour", perks: ["Browse routes, fares & traffic", "No account needed"] },
  { id: "free", name: "Free", price: "₱0", quota: "10 questions / hour", perks: ["Everything in Guest", "Saved across sessions"] },
  { id: "pro", name: "Pro", price: "₱149/mo", quota: "100 questions / hour", perks: ["Everything in Free", "Offline maps"], upgradeTo: "pro" },
  { id: "max", name: "Max", price: "₱349/mo", quota: "Unlimited questions", perks: ["Everything in Pro", "Priority routing", "Early crowding alerts"], upgradeTo: "max" },
];

const PricingPlans = ({ onRequireAuth }: { onRequireAuth: () => void }) => {
  const { user, isAuthed, upgrade } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const currentTier = isAuthed ? user?.tier : "guest";

  const handleUpgrade = async (plan: Plan) => {
    if (!plan.upgradeTo) return;
    if (!isAuthed) {
      onRequireAuth();
      return;
    }
    setBusy(plan.id);
    await upgrade(plan.upgradeTo);
    setBusy(null);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {PLANS.map((plan) => {
        const isCurrent = plan.id === currentTier;
        const accent = plan.id === "pro" || plan.id === "max";
        return (
          <div
            key={plan.id}
            className={`rounded-2xl border p-4 flex flex-col gap-3 ${
              isCurrent ? "border-cebu-blue bg-cebu-blue/5" : "border-outline-variant bg-surface-container-lowest"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <h4 className="text-base font-bold text-on-surface">{plan.name}</h4>
              <span className={`text-sm font-bold ${accent ? "text-clay" : "text-on-surface-variant"}`}>{plan.price}</span>
            </div>
            <p className="text-sm font-semibold text-on-surface">{plan.quota}</p>
            <ul className="space-y-1 flex-1">
              {plan.perks.map((perk) => (
                <li key={perk} className="flex items-start gap-1.5 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-safe-green text-sm leading-tight">check</span>
                  {perk}
                </li>
              ))}
            </ul>
            {isCurrent ? (
              <span className="text-center text-xs font-bold text-cebu-blue py-2 rounded-xl bg-cebu-blue/10">
                Current plan
              </span>
            ) : plan.upgradeTo ? (
              <button
                onClick={() => handleUpgrade(plan)}
                disabled={busy === plan.id}
                className="text-sm font-semibold py-2 rounded-xl bg-clay text-white active:scale-95 transition-transform disabled:opacity-60"
              >
                {busy === plan.id ? "Upgrading…" : isAuthed ? `Upgrade to ${plan.name}` : "Sign in to upgrade"}
              </button>
            ) : (
              <span className="h-[36px]" aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PricingPlans;
```

- [ ] **Step 2: Lint + type-check**

Run: `cd sugboway-web && npx tsc --noEmit && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add sugboway-web/src/components/auth/PricingPlans.tsx
git commit -m "feat(web): four-tier pricing cards"
```

---

### Task 12: Wire chat auth, quota indicator, and Profile rework

**Files:**
- Modify: `sugboway-web/src/app/page.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 9), `AuthModal` (Task 10), `PricingPlans` (Task 11).

- [ ] **Step 1: Imports, hook, modal state**

In `sugboway-web/src/app/page.tsx`, add imports near the existing component imports (after the `PeakWarning` import, ~line 23):

```tsx
import { useAuth } from "@/components/AuthProvider";
import AuthModal from "@/components/auth/AuthModal";
import PricingPlans from "@/components/auth/PricingPlans";
```

Inside the page component, near the other `useState`/hook calls (next to `const { isPeak, ... } = useCebuTime();`, ~line 528), add:

```tsx
  const { user, isAuthed, token, logout } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register">("login");

  const openAuth = (mode: "login" | "register") => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  // Quota shown in the UI. Guests start at 5, free at 10; refined by each chat response.
  const tierLimitLabel = !isAuthed ? 5 : user?.tier === "pro" ? 100 : user?.tier === "max" ? Infinity : 10;
```

- [ ] **Step 2: Replace the old premium state and surface verification toast**

Remove the two lines that declare the old demo state (`const [isPremiumUser, setIsPremiumUser] = useState(false);` and `const [remainingQuota, setRemainingQuota] = useState(5);`) — replace with just the quota counter, keyed off auth:

```tsx
  const [remainingQuota, setRemainingQuota] = useState<number>(5);
```

After the existing mount effects, add an effect to read the `?verified=1` redirect and prompt sign-in:

```tsx
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") {
      openAuth("login");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
```

- [ ] **Step 3: Attach the token to the chat request**

In the chat send handler, find the AI fetch to `${AI_API_URL}/api/v1/chat` and add the Authorization header when a token exists. Change the fetch options' `headers` to:

```tsx
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
```

(The response already sets `remainingQuota` from `data.remaining`; leave that intact.)

- [ ] **Step 4: Replace every `isPremiumUser` usage**

Search `page.tsx` for `isPremiumUser` and `setIsPremiumUser` and replace their behavior:
- The Profile "Questions left this hour" value: `{isAuthed && user?.tier === "max" ? "Unlimited" : `${remainingQuota} of ${tierLimitLabel === Infinity ? "∞" : tierLimitLabel}`}`.
- The rate-limit modal "Go Premium" button (`setIsPremiumUser(true); setRemainingQuota(9999);`): replace with `onClick={() => { setIsRateLimited(false); isAuthed ? setCurrentTab("profile") : openAuth("register"); }}` and label it `{isAuthed ? "See plans" : "Create a free account"}`.
- Remove the inline `Upgrade` button that flipped `isPremiumUser`; the upgrade path now lives in `PricingPlans`.

- [ ] **Step 5: Rework the Profile tab**

Replace the Profile "Profile Card" + "SugboWay Premium Subscription Card" sections (the `{/* Profile Card */}` and `{/* SugboWay Premium Subscription Card */}` blocks) with an auth-aware account section + pricing. Keep the Emergency hotlines section that follows; **delete** the "Saved stations list" section (`{/* Saved stations list */}` block) entirely.

New account + plans markup:

```tsx
              {/* Account */}
              <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 space-y-4">
                {isAuthed ? (
                  <>
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-cebu-blue/10 flex items-center justify-center text-cebu-blue shrink-0">
                        <span className="material-symbols-outlined text-3xl">account_circle</span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-on-surface truncate">{user?.email}</h3>
                        <span className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full bg-clay/10 text-clay capitalize">
                          {user?.tier} plan
                        </span>
                      </div>
                    </div>
                    <div className="bg-surface-container border border-outline-variant/40 rounded-xl p-4 flex justify-between items-center">
                      <span className="text-xs text-on-surface-variant">Questions left this hour</span>
                      <span className="text-base font-bold text-on-surface">
                        {user?.tier === "max" ? "Unlimited" : `${remainingQuota} of ${tierLimitLabel === Infinity ? "∞" : tierLimitLabel}`}
                      </span>
                    </div>
                    <button onClick={logout} className="text-sm font-semibold text-on-surface-variant hover:text-error">
                      Sign out
                    </button>
                  </>
                ) : (
                  <div className="text-center space-y-3 py-2">
                    <span className="material-symbols-outlined text-cebu-blue text-4xl">account_circle</span>
                    <div>
                      <h3 className="text-base font-bold text-on-surface">You're browsing as a guest</h3>
                      <p className="text-sm text-on-surface-variant mt-1">
                        Guests get 5 questions/hour. Create a free account for 10.
                      </p>
                    </div>
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => openAuth("register")} className="bg-cebu-blue text-white font-semibold text-sm px-4 py-2.5 rounded-xl active:scale-95 transition-transform">
                        Create account
                      </button>
                      <button onClick={() => openAuth("login")} className="bg-surface-container border border-outline-variant text-on-surface font-semibold text-sm px-4 py-2.5 rounded-xl active:scale-95 transition-transform">
                        Sign in
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Plans */}
              <section className="space-y-3">
                <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-clay">workspace_premium</span>
                  Plans
                </h3>
                <PricingPlans onRequireAuth={() => openAuth("register")} />
              </section>
```

- [ ] **Step 6: Render the modal once**

Just before the closing of the page's top-level returned fragment (next to the other modals/drawers near the end of the JSX, e.g. after `NavigationDrawer`/rate-limit modal), add:

```tsx
        <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} initialMode={authModalMode} />
```

- [ ] **Step 7: Lint + type-check**

Run: `cd sugboway-web && npx tsc --noEmit && npm run lint`
Expected: no type errors; lint passes. Resolve any remaining `isPremiumUser`/`setIsPremiumUser`/`setRemainingQuota(9999)` references the compiler flags.

- [ ] **Step 8: Commit**

```bash
git add sugboway-web/src/app/page.tsx
git commit -m "feat(web): auth-aware chat quota, profile, and plans"
```

---

## Phase D — Config & docs

### Task 13: Env examples + docs

**Files:**
- Modify: `sugboway-routing-api/.env.example`
- Modify: `sugboway-ai-service/.env.example`
- Modify: `sugboway-web/.env.example`
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Routing API env**

Append to `sugboway-routing-api/.env.example`:

```
# --- Authentication ---
# Shared HS256 secret. MUST match AUTH_JWT_SECRET in the AI service.
AUTH_JWT_SECRET=
# Web origin, for the post-verification redirect.
APP_BASE_URL=http://localhost:3000
# This API's public origin, used to build the verification link in emails.
PUBLIC_API_URL=http://localhost:8080
# SMTP for verification email (e.g. a Gmail app password).
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=SugboWay <no-reply@sugboway.app>
```

- [ ] **Step 2: AI service env**

Append to `sugboway-ai-service/.env.example`:

```
# Shared HS256 secret. MUST match AUTH_JWT_SECRET in the routing API.
AUTH_JWT_SECRET=
```

- [ ] **Step 3: Web env note**

Append to `sugboway-web/.env.example`:

```
# Auth uses NEXT_PUBLIC_ROUTING_API_URL (the Go routing API) — no new web vars.
# That backend must have AUTH_JWT_SECRET + SMTP configured for sign-up to work.
```

- [ ] **Step 4: README + CLAUDE.md**

In `README.md`, under the features/architecture, add a short "Accounts & plans" note: real email-verified accounts via the Go API (users table, bcrypt, HS256 JWT), Python enforces per-tier chat quota (Guest 5 / Free 10 / Pro ₱149·100 / Max ₱349·∞), upgrades are a demo. List the new env vars in the routing-API and AI-service rows of the deploy table.

In `CLAUDE.md`, add to the AI-service flow / architecture notes: chat quota is now per-user via a shared-secret JWT issued by the Go service (tier in the claim); guests remain 5/IP. Note `AUTH_JWT_SECRET` must match across both backends and SMTP vars live on the Go service.

- [ ] **Step 5: Commit**

```bash
git add sugboway-routing-api/.env.example sugboway-ai-service/.env.example sugboway-web/.env.example README.md CLAUDE.md
git commit -m "docs: document auth env vars, tiers, and quota flow"
```

---

## Self-Review notes

- **Spec coverage:** users table (T1), passwords/JWT/tiers (T2–T3), ports (T4), Postgres store (T5), endpoints + SMTP + verify-before-login (T6), Python tier enforcement + guest fallback (T7–T8), web provider/modal/pricing/profile + chat token + verified-redirect toast (T9–T12), env/docs (T13). Profile keeps hotlines, drops mock Saved stops (T12). "Perks are copy, not gates" honored — only quota is enforced.
- **Type consistency:** `Tier`/`AuthUser` shared from `authApi.ts`; `Claims.Subject` is the string user id used by `Upgrade`; Python `verify_token` returns `user_id`/`tier`; JSON tier strings `free|pro|max` consistent across Go, Python, web.
- **No placeholders:** every code step contains full code; commands include expected output.
