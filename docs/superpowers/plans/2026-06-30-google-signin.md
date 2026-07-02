# Google Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users sign in / sign up with Google, issuing the same app JWT the email/password flow issues (so the Python quota path is unchanged).

**Architecture:** Google Identity Services (GIS) gives the browser a Google ID token; the web POSTs it to a new Go endpoint `POST /api/v1/auth/google`, which verifies it server-side (audience = our client ID), finds-or-creates the user (link by email), and returns our JWT. Optional via env: off when the client ID is unset.

**Tech Stack:** Go 1.21 (Fiber, pgx, `google.golang.org/api/idtoken`), Next.js 16 / React 19 (Google Identity Services script).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-30-google-signin-design.md`.
- Flow: **GIS ID-token**. The web sends `{ credential: "<google-id-token>" }`; Go verifies and returns `{ token, user }`.
- **Link by email:** a Google sign-in whose email already exists logs into that account; if it was unverified it becomes verified. Email is the unique key.
- Google-created accounts: **email-verified, Free tier, name from the Google profile, empty password** (Google-only sign-in). Setting a password later is OUT OF SCOPE.
- Config: `GOOGLE_CLIENT_ID` (Go, audience check) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (web, build-time). When unset: the endpoint returns `503 {"error":"google_not_configured"}` and the web button renders nothing.
- Tier identifiers are exactly `free`, `pro`, `max`; tiers/quota are unchanged by this feature.
- Error codes (exact JSON `error` values): `google_not_configured` (503), `invalid_body` (400), `invalid_google_token` (401), `google_email_unverified` (401), `create_failed`/`verify_failed` (500).
- The web app has **no test runner**: its checks are `npx tsc --noEmit` (must be clean) and `npm run lint` (introduce no NEW errors beyond the pre-existing `react-hooks/set-state-in-effect` pattern the codebase already uses). No `any` (repo lints `@typescript-eslint/no-explicit-any` as an error).
- Before non-trivial Next.js/React code, consult `sugboway-web/node_modules/next/dist/docs/` (bundled Next 16 has breaking changes).
- State uses React context + hooks (the existing `AuthProvider`/`ThemeProvider` pattern) — no Zustand. Components are arrow functions, PascalCase, default export.
- Use existing design tokens (sand/sea palette, `cebu-blue`, `surface-*`, `on-surface*`, `outline-variant`); no generic colors.
- Run Go commands from `sugboway-routing-api/`, web from `sugboway-web/`.
- Every commit message ends with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

**Go (`sugboway-routing-api/`)**
- Modify `domain/ports.go` — add `GoogleIdentity`, `GoogleVerifier`, and two `UserStore` methods.
- Modify `adapter/repository/users.go` — implement `CreateVerifiedUser`, `MarkVerifiedByEmail`.
- Create `adapter/google/idtoken.go` — `IDTokenVerifier` implementing `domain.GoogleVerifier`.
- Modify `adapter/api/auth_handler.go` — `Google` handler + a `google` field; `NewAuthHandler` gains a verifier param.
- Modify `adapter/api/auth_handler_test.go` — fake verifier, fake-store methods, `/google` tests, `testApp` update.
- Modify `main.go` — build the verifier from `GOOGLE_CLIENT_ID`, wire it, mount `/google`.
- Modify `go.mod`/`go.sum` — add `google.golang.org/api/idtoken`.

**Web (`sugboway-web/`)**
- Modify `src/lib/authApi.ts` — `authApi.googleLogin`.
- Modify `src/components/AuthProvider.tsx` — `googleLogin`.
- Create `src/components/auth/GoogleButton.tsx` — the GIS button (hidden if unconfigured).
- Modify `src/components/auth/AuthModal.tsx` — render the button + an "or" divider.

**Docs**
- Modify `sugboway-routing-api/.env.example`; create `docs/google-signin-setup.md`; update `README.md` + `CLAUDE.md`.

---

## Task 1: Domain ports — GoogleVerifier + store methods

**Files:**
- Modify: `sugboway-routing-api/domain/ports.go`

**Interfaces:**
- Produces (consumed by Tasks 2–4):
  - `type GoogleIdentity struct { Sub, Email, Name string; EmailVerified bool }`
  - `GoogleVerifier` with `Verify(ctx context.Context, credential string) (*GoogleIdentity, error)`
  - `UserStore.CreateVerifiedUser(ctx, name, email string) (*User, error)`
  - `UserStore.MarkVerifiedByEmail(ctx, email string) error`

- [ ] **Step 1: Add the types/methods**

In `sugboway-routing-api/domain/ports.go`, add to the `UserStore` interface (after `UpdateTier`):

```go
	// CreateVerifiedUser inserts a new already-verified, password-less account
	// (used for Google sign-up). Errors if the email already exists.
	CreateVerifiedUser(ctx context.Context, name, email string) (*User, error)
	// MarkVerifiedByEmail flags an existing account verified (used when linking a
	// Google login to a pre-existing unverified account).
	MarkVerifiedByEmail(ctx context.Context, email string) error
```

Then append, after the `EmailSender` interface:

```go
// GoogleIdentity is the verified identity from a Google ID token.
type GoogleIdentity struct {
	Sub           string
	Email         string
	Name          string
	EmailVerified bool
}

// GoogleVerifier validates a Google ID token. Implemented by the idtoken adapter;
// faked in tests.
type GoogleVerifier interface {
	Verify(ctx context.Context, credential string) (*GoogleIdentity, error)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd sugboway-routing-api && go build ./...`
Expected: FAILS — `*PostgresUserStore` no longer satisfies `domain.UserStore` (the two new methods are missing). This is expected; Task 2 adds them. (If you want a clean build first, do Tasks 1 and 2 together before building.)

- [ ] **Step 3: Commit**

```bash
git add sugboway-routing-api/domain/ports.go
git commit -m "feat(routing-api): GoogleVerifier port + verified-user store methods"
```

---

## Task 2: Postgres UserStore — verified-user methods

**Files:**
- Modify: `sugboway-routing-api/adapter/repository/users.go`

**Interfaces:**
- Consumes: `domain.User` (Task 1).
- Produces: `PostgresUserStore.CreateVerifiedUser`, `PostgresUserStore.MarkVerifiedByEmail`.

- [ ] **Step 1: Implement the methods**

Append to `sugboway-routing-api/adapter/repository/users.go` (before the closing of the file, after `UpdateTier`):

```go
func (s *PostgresUserStore) CreateVerifiedUser(ctx context.Context, name, email string) (*domain.User, error) {
	email = normalizeEmail(email)
	const q = `
		INSERT INTO users (name, email, password_hash, email_verified)
		VALUES ($1, $2, '', TRUE)
		RETURNING id, name, email, password_hash, tier, email_verified`
	u := &domain.User{}
	err := s.Pool.QueryRow(ctx, q, name, email).
		Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Tier, &u.EmailVerified)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *PostgresUserStore) MarkVerifiedByEmail(ctx context.Context, email string) error {
	email = normalizeEmail(email)
	const q = `UPDATE users SET email_verified = TRUE, updated_at = now() WHERE email = $1`
	_, err := s.Pool.Exec(ctx, q, email)
	return err
}
```

- [ ] **Step 2: Build + vet**

Run: `cd sugboway-routing-api && go build ./... && go vet ./adapter/repository/`
Expected: builds clean (now that the store satisfies the interface). No vet errors.

- [ ] **Step 3: Commit**

```bash
git add sugboway-routing-api/adapter/repository/users.go
git commit -m "feat(routing-api): Postgres CreateVerifiedUser + MarkVerifiedByEmail"
```

---

## Task 3: Google ID-token verifier adapter

**Files:**
- Create: `sugboway-routing-api/adapter/google/idtoken.go`
- Modify: `sugboway-routing-api/go.mod`, `go.sum`

**Interfaces:**
- Consumes: `domain.GoogleIdentity`, `domain.GoogleVerifier` (Task 1).
- Produces: `google.NewIDTokenVerifier(clientID string) *IDTokenVerifier` implementing `domain.GoogleVerifier`.

> No unit test here: verification requires real Google-signed tokens. The handler is
> covered with a fake verifier in Task 4. Correctness is checked by `go build` + `go vet`.

- [ ] **Step 1: Add the dependency**

Run: `cd sugboway-routing-api && go get google.golang.org/api/idtoken`
Expected: `go.mod` now requires `google.golang.org/api`.

- [ ] **Step 2: Implement the adapter**

`sugboway-routing-api/adapter/google/idtoken.go`:

```go
package google

import (
	"context"
	"fmt"

	"sugboway-routing-api/domain"

	"google.golang.org/api/idtoken"
)

// IDTokenVerifier validates Google ID tokens against Google's public keys, with
// the audience pinned to our OAuth client ID.
type IDTokenVerifier struct {
	clientID string
}

// NewIDTokenVerifier builds a verifier for the given OAuth client ID.
func NewIDTokenVerifier(clientID string) *IDTokenVerifier {
	return &IDTokenVerifier{clientID: clientID}
}

// Verify validates the token (signature, audience, expiry, issuer) and returns
// the identity.
func (v *IDTokenVerifier) Verify(ctx context.Context, credential string) (*domain.GoogleIdentity, error) {
	payload, err := idtoken.Validate(ctx, credential, v.clientID)
	if err != nil {
		return nil, fmt.Errorf("google idtoken validate: %w", err)
	}
	if payload.Issuer != "accounts.google.com" && payload.Issuer != "https://accounts.google.com" {
		return nil, fmt.Errorf("unexpected google issuer: %s", payload.Issuer)
	}
	email, _ := payload.Claims["email"].(string)
	name, _ := payload.Claims["name"].(string)
	emailVerified, _ := payload.Claims["email_verified"].(bool)
	return &domain.GoogleIdentity{
		Sub:           payload.Subject,
		Email:         email,
		Name:          name,
		EmailVerified: emailVerified,
	}, nil
}
```

- [ ] **Step 3: Build + vet + tidy**

Run: `cd sugboway-routing-api && go mod tidy && go build ./... && go vet ./adapter/google/`
Expected: builds clean; no vet errors.

- [ ] **Step 4: Commit**

```bash
git add sugboway-routing-api/adapter/google/idtoken.go sugboway-routing-api/go.mod sugboway-routing-api/go.sum
git commit -m "feat(routing-api): Google ID-token verifier adapter"
```

---

## Task 4: Google auth endpoint + wiring (TDD with fakes)

**Files:**
- Modify: `sugboway-routing-api/adapter/api/auth_handler.go`
- Modify: `sugboway-routing-api/adapter/api/auth_handler_test.go`
- Modify: `sugboway-routing-api/main.go`

**Interfaces:**
- Consumes: `domain.GoogleVerifier`, `domain.GoogleIdentity`, `UserStore.CreateVerifiedUser`/`MarkVerifiedByEmail` (Tasks 1–2); `google.NewIDTokenVerifier` (Task 3); existing `issue`, `userJSON`, `GetUserByEmail`.
- Produces: `NewAuthHandler(store, email, google, cfg)` (new 3rd param) and `(*AuthHandler).Google`.

- [ ] **Step 1: Update the handler struct + constructor**

In `sugboway-routing-api/adapter/api/auth_handler.go`, change the struct and constructor:

```go
// AuthHandler serves the /api/v1/auth endpoints.
type AuthHandler struct {
	store  domain.UserStore
	email  domain.EmailSender
	google domain.GoogleVerifier // nil when GOOGLE_CLIENT_ID is unset
	cfg    AuthConfig
}

// NewAuthHandler builds an auth handler. google may be nil (feature disabled).
func NewAuthHandler(store domain.UserStore, email domain.EmailSender, google domain.GoogleVerifier, cfg AuthConfig) *AuthHandler {
	return &AuthHandler{store: store, email: email, google: google, cfg: cfg}
}
```

- [ ] **Step 2: Add the Google handler**

In the same file, add (e.g. after `Login`):

```go
// Google verifies a Google ID token and signs the user in (find-or-create,
// link by email). Disabled with 503 when no verifier is configured.
func (h *AuthHandler) Google(c *fiber.Ctx) error {
	if h.google == nil {
		return c.Status(503).JSON(fiber.Map{"error": "google_not_configured"})
	}
	var in struct {
		Credential string `json:"credential"`
	}
	if err := c.BodyParser(&in); err != nil || in.Credential == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	id, err := h.google.Verify(c.Context(), in.Credential)
	if err != nil || id == nil {
		return c.Status(401).JSON(fiber.Map{"error": "invalid_google_token"})
	}
	if !id.EmailVerified {
		return c.Status(401).JSON(fiber.Map{"error": "google_email_unverified"})
	}
	email := strings.ToLower(strings.TrimSpace(id.Email))

	u, _ := h.store.GetUserByEmail(c.Context(), email)
	if u == nil {
		created, err := h.store.CreateVerifiedUser(c.Context(), id.Name, email)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "create_failed"})
		}
		return h.issue(c, created)
	}
	if !u.EmailVerified {
		if err := h.store.MarkVerifiedByEmail(c.Context(), email); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "verify_failed"})
		}
		u.EmailVerified = true
	}
	return h.issue(c, u)
}
```

- [ ] **Step 3: Write the failing tests**

In `sugboway-routing-api/adapter/api/auth_handler_test.go`:

(a) Add the fake-store methods (next to the other `fakeStore` methods):

```go
func (f *fakeStore) CreateVerifiedUser(_ context.Context, name, email string) (*domain.User, error) {
	email = strings.ToLower(email)
	if _, ok := f.users[email]; ok {
		return nil, fiber.NewError(409, "exists")
	}
	f.nextID++
	u := &domain.User{ID: f.nextID, Name: name, Email: email, Tier: "free", EmailVerified: true}
	f.users[email] = u
	return u, nil
}

func (f *fakeStore) MarkVerifiedByEmail(_ context.Context, email string) error {
	if u, ok := f.users[strings.ToLower(email)]; ok {
		u.EmailVerified = true
	}
	return nil
}
```

(b) Add a fake verifier:

```go
type fakeGoogle struct {
	id  *domain.GoogleIdentity
	err error
}

func (g *fakeGoogle) Verify(_ context.Context, _ string) (*domain.GoogleIdentity, error) {
	return g.id, g.err
}
```

(c) Add a test app helper that wires `/google` with a verifier:

```go
func testAppGoogle(store domain.UserStore, mail domain.EmailSender, g domain.GoogleVerifier) (*fiber.App, *AuthHandler) {
	h := NewAuthHandler(store, mail, g, AuthConfig{
		JWTSecret: "test-secret", AppBaseURL: "http://web", PublicAPIURL: "http://api",
		TokenTTL: time.Hour, VerifyTTL: 24 * time.Hour,
	})
	app := fiber.New()
	grp := app.Group("/api/v1/auth")
	grp.Post("/register", h.Register)
	grp.Get("/verify", h.Verify)
	grp.Post("/login", h.Login)
	grp.Post("/google", h.Google)
	return app, h
}
```

(d) The tests:

```go
func TestGoogleNewUserCreatesVerifiedAccount(t *testing.T) {
	store := newFakeStore()
	g := &fakeGoogle{id: &domain.GoogleIdentity{Sub: "g1", Email: "new@gmail.com", Name: "Goog Le", EmailVerified: true}}
	app, _ := testAppGoogle(store, newFakeEmail(), g)

	code, out := doJSON(t, app, "POST", "/api/v1/auth/google", `{"credential":"x"}`, "")
	if code != 200 || out["token"] == nil {
		t.Fatalf("new google user => 200 + token, got %d %v", code, out)
	}
	user, _ := out["user"].(map[string]any)
	if user["name"] != "Goog Le" || user["tier"] != "free" {
		t.Fatalf("expected name+free tier, got %v", out["user"])
	}
	u, _ := store.GetUserByEmail(context.Background(), "new@gmail.com")
	if u == nil || !u.EmailVerified {
		t.Fatalf("user should exist and be verified, got %v", u)
	}
}

func TestGoogleLinksUnverifiedPasswordAccount(t *testing.T) {
	store := newFakeStore()
	g := &fakeGoogle{id: &domain.GoogleIdentity{Sub: "g2", Email: "a@b.com", Name: "Juan", EmailVerified: true}}
	app, _ := testAppGoogle(store, newFakeEmail(), g)

	// pre-existing UNVERIFIED password account with the same email
	doJSON(t, app, "POST", "/api/v1/auth/register", `{"name":"Juan","email":"a@b.com","password":"sugbo123"}`, "")

	code, _ := doJSON(t, app, "POST", "/api/v1/auth/google", `{"credential":"x"}`, "")
	if code != 200 {
		t.Fatalf("google link => 200, got %d", code)
	}
	// now password login should succeed (account became verified)
	code, _ = doJSON(t, app, "POST", "/api/v1/auth/login", `{"email":"a@b.com","password":"sugbo123"}`, "")
	if code != 200 {
		t.Fatalf("after google link, password login => 200, got %d", code)
	}
}

func TestGoogleNotConfiguredReturns503(t *testing.T) {
	store := newFakeStore()
	app, _ := testAppGoogle(store, newFakeEmail(), nil) // no verifier
	code, out := doJSON(t, app, "POST", "/api/v1/auth/google", `{"credential":"x"}`, "")
	if code != 503 || out["error"] != "google_not_configured" {
		t.Fatalf("unconfigured => 503 google_not_configured, got %d %v", code, out)
	}
}

func TestGoogleInvalidTokenReturns401(t *testing.T) {
	store := newFakeStore()
	g := &fakeGoogle{err: fiber.NewError(401, "bad")}
	app, _ := testAppGoogle(store, newFakeEmail(), g)
	code, out := doJSON(t, app, "POST", "/api/v1/auth/google", `{"credential":"x"}`, "")
	if code != 401 || out["error"] != "invalid_google_token" {
		t.Fatalf("bad token => 401 invalid_google_token, got %d %v", code, out)
	}
}

func TestGoogleUnverifiedEmailReturns401(t *testing.T) {
	store := newFakeStore()
	g := &fakeGoogle{id: &domain.GoogleIdentity{Sub: "g3", Email: "x@gmail.com", Name: "X", EmailVerified: false}}
	app, _ := testAppGoogle(store, newFakeEmail(), g)
	code, out := doJSON(t, app, "POST", "/api/v1/auth/google", `{"credential":"x"}`, "")
	if code != 401 || out["error"] != "google_email_unverified" {
		t.Fatalf("unverified google email => 401 google_email_unverified, got %d %v", code, out)
	}
}
```

(e) Update the existing `testApp` helper's `NewAuthHandler` call to pass `nil` for the new param:

```go
	h := NewAuthHandler(store, mail, nil, AuthConfig{
		JWTSecret: "test-secret", AppBaseURL: "http://web", PublicAPIURL: "http://api",
		TokenTTL: time.Hour, VerifyTTL: 24 * time.Hour,
	})
```

- [ ] **Step 4: Run tests to verify they fail, then pass**

Run: `cd sugboway-routing-api && go test ./adapter/api/ -run TestGoogle -v`
Expected first: FAIL/compile-error referencing `Google`/`NewAuthHandler` arity until Steps 1–3 are all in. After all edits: the 5 `TestGoogle*` tests PASS.

- [ ] **Step 5: Wire `main.go`**

In `sugboway-routing-api/main.go`, add the import `"sugboway-routing-api/adapter/google"`. After the email-sender selection block (before `authHandler := api.NewAuthHandler(...)`), add:

```go
	var googleVerifier domain.GoogleVerifier
	if gid := os.Getenv("GOOGLE_CLIENT_ID"); gid != "" {
		googleVerifier = google.NewIDTokenVerifier(gid)
		log.Println("[SugboWay Routing API] Google sign-in: enabled.")
	} else {
		log.Println("[SugboWay Routing API] Google sign-in: disabled (GOOGLE_CLIENT_ID unset).")
	}
```

Change the handler construction to pass it:

```go
	authHandler := api.NewAuthHandler(userStore, mailSender, googleVerifier, api.AuthConfig{
		JWTSecret: jwtSecret, AppBaseURL: appBaseURL, PublicAPIURL: publicAPIURL,
		TokenTTL: 7 * 24 * time.Hour, VerifyTTL: 24 * time.Hour,
	})
```

And mount the route (next to the other `authGroup` routes):

```go
	authGroup.Post("/google", authHandler.Google)
```

- [ ] **Step 6: Full build + test**

Run: `cd sugboway-routing-api && go build ./... && go test ./...`
Expected: builds; all tests pass (existing auth tests + the 5 new Google tests + email/domain).

- [ ] **Step 7: Commit**

```bash
git add sugboway-routing-api/adapter/api/auth_handler.go sugboway-routing-api/adapter/api/auth_handler_test.go sugboway-routing-api/main.go
git commit -m "feat(routing-api): POST /api/v1/auth/google (verify + find-or-create)"
```

---

## Task 5: Web — googleLogin in the API client + provider

**Files:**
- Modify: `sugboway-web/src/lib/authApi.ts`
- Modify: `sugboway-web/src/components/AuthProvider.tsx`

**Interfaces:**
- Produces: `authApi.googleLogin(credential)` and `useAuth().googleLogin(credential)`.

- [ ] **Step 1: Add `googleLogin` to the API client**

In `sugboway-web/src/lib/authApi.ts`, add to the `authApi` object (after `login`):

```ts
  async googleLogin(credential: string): Promise<LoginResult> {
    const { status, data } = await post("/google", { credential });
    if (status === 200) return { ok: true, token: data.token, user: data.user };
    return { ok: false, error: data.error ?? "google_failed" };
  },
```

- [ ] **Step 2: Add `googleLogin` to the provider**

In `sugboway-web/src/components/AuthProvider.tsx`:

(a) Add to the `AuthContextValue` interface (after `login`):

```ts
  googleLogin: (credential: string) => Promise<{ ok: boolean; error?: string }>;
```

(b) Add to the `createContext` default object (after `login: async () => ({ ok: false }),`):

```ts
  googleLogin: async () => ({ ok: false }),
```

(c) Add the implementation (after the `login` useCallback):

```ts
  const googleLogin = useCallback(async (credential: string) => {
    const r = await authApi.googleLogin(credential);
    if (r.ok && r.token && r.user) persist(r.token, r.user);
    return { ok: r.ok, error: r.error };
  }, [persist]);
```

(d) Add `googleLogin` to the provider's `value={{ ... }}` object.

- [ ] **Step 3: Type-check + lint**

Run: `cd sugboway-web && npx tsc --noEmit && npx eslint src/lib/authApi.ts src/components/AuthProvider.tsx`
Expected: tsc clean; eslint shows only the pre-existing `react-hooks/set-state-in-effect` in AuthProvider (no new errors).

- [ ] **Step 4: Commit**

```bash
git add sugboway-web/src/lib/authApi.ts sugboway-web/src/components/AuthProvider.tsx
git commit -m "feat(web): googleLogin in auth API client + provider"
```

---

## Task 6: Web — GoogleButton + AuthModal integration

**Files:**
- Create: `sugboway-web/src/components/auth/GoogleButton.tsx`
- Modify: `sugboway-web/src/components/auth/AuthModal.tsx`

**Interfaces:**
- Consumes: `useAuth().googleLogin` (Task 5).
- Produces: `GoogleButton` with prop `{ onError?: (msg: string) => void }`.

- [ ] **Step 1: Create the GoogleButton**

`sugboway-web/src/components/auth/GoogleButton.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GoogleCredentialResponse {
  credential: string;
}
interface GoogleIdApi {
  initialize: (config: { client_id: string; callback: (r: GoogleCredentialResponse) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

const loadScript = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no document"));
      return;
    }
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script error")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script error"));
    document.head.appendChild(s);
  });

const GoogleButton = ({ onError }: { onError?: (msg: string) => void }) => {
  const { googleLogin } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => {
            void googleLogin(resp.credential).then((r) => {
              if (!r.ok && onError) onError("Google sign-in failed. Please try again.");
            });
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          width: 320,
        });
      })
      .catch(() => {
        if (onError) onError("Couldn't load Google sign-in.");
      });
    return () => {
      cancelled = true;
    };
  }, [googleLogin, onError]);

  if (!CLIENT_ID) return null;
  return <div ref={ref} className="flex justify-center" />;
};

export default GoogleButton;
```

- [ ] **Step 2: Render it in the AuthModal**

In `sugboway-web/src/components/auth/AuthModal.tsx`:

(a) Add the import near the top:

```tsx
import GoogleButton from "@/components/auth/GoogleButton";
```

(b) In the non-`check-email` branch (the `<>...</>` that holds the header + form), insert the button + divider **between** the header `</div>` and the `<div className="space-y-3">` form block:

```tsx
            <GoogleButton onError={setError} />
            <div className="flex items-center gap-3 text-xs text-on-surface-variant">
              <span className="h-px flex-1 bg-outline-variant" />
              or
              <span className="h-px flex-1 bg-outline-variant" />
            </div>
```

(The `GoogleButton` returns null when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is unset; the divider then sits above the form harmlessly — acceptable. If you prefer to hide the divider too when Google is off, that's optional polish, not required.)

- [ ] **Step 3: Type-check + lint**

Run: `cd sugboway-web && npx tsc --noEmit && npx eslint src/components/auth/GoogleButton.tsx src/components/auth/AuthModal.tsx`
Expected: tsc clean. eslint: no NEW errors beyond the pre-existing `react-hooks/set-state-in-effect` already present in `AuthModal.tsx`. `GoogleButton.tsx` itself should be clean (its effect does not call setState synchronously; it only loads the script and renders the Google button).

- [ ] **Step 4: Commit**

```bash
git add sugboway-web/src/components/auth/GoogleButton.tsx sugboway-web/src/components/auth/AuthModal.tsx
git commit -m "feat(web): Continue-with-Google button in the auth modal"
```

---

## Task 7: Config + docs

**Files:**
- Modify: `sugboway-routing-api/.env.example`
- Create: `docs/google-signin-setup.md`
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Routing-API env**

Append to `sugboway-routing-api/.env.example`:

```
# --- Google sign-in (optional) ---
# OAuth 2.0 Web client ID from Google Cloud Console. When set, POST /api/v1/auth/google
# is enabled. Must be the SAME client ID the web app uses (NEXT_PUBLIC_GOOGLE_CLIENT_ID).
GOOGLE_CLIENT_ID=
```

- [ ] **Step 2: Setup guide**

Create `docs/google-signin-setup.md`:

```markdown
# Google Sign-In Setup

Google sign-in is optional — it turns on only when the OAuth client ID is set on both
services. Until then, the "Continue with Google" button is hidden and the endpoint
returns 503.

## 1. Create an OAuth client ID (Google Cloud Console)
1. Go to https://console.cloud.google.com → create or pick a project.
2. **APIs & Services → OAuth consent screen** → set it up (External; app name "SugboWay";
   add your email). You can keep it in "Testing" while developing.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
4. Application type: **Web application**.
5. **Authorized JavaScript origins** — add your web origins (no path, no trailing slash):
   - `https://sugboway-web.onrender.com`
   - `http://localhost:3000`
6. Create → copy the **Client ID** (looks like `1234-abc.apps.googleusercontent.com`).
   (No client secret is needed for this flow.)

## 2. Set it on both services
- **Render → sugboway-routing-api → Environment:** `GOOGLE_CLIENT_ID` = the client ID.
- **Web (sugboway-web):** `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = the SAME client ID.
  This is a **build-time** variable, so you must **rebuild** the web service after setting it.

## 3. Verify
- Routing-API logs show `Google sign-in: enabled.` on boot.
- The auth modal shows a "Continue with Google" button. Signing in creates a verified,
  Free account (or logs into your existing account if the email matches).
```

- [ ] **Step 3: README + CLAUDE.md**

In `README.md` (Accounts & plans area) add a line: Google sign-in is supported (Google
Identity Services ID-token verified server-side; links to an existing account by email);
it's optional via `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

In `CLAUDE.md` (auth section) note: `POST /api/v1/auth/google` verifies a Google ID token
(audience = `GOOGLE_CLIENT_ID`) and find-or-creates the user (link by email), returning
the same JWT as password login; disabled (503 / button hidden) when the client ID is unset.

- [ ] **Step 4: Commit**

```bash
git add sugboway-routing-api/.env.example docs/google-signin-setup.md README.md CLAUDE.md
git commit -m "docs: Google sign-in env + setup guide"
```

---

## Self-Review notes

- **Spec coverage:** ports + identity (T1), verified-user persistence (T2), ID-token adapter (T3), endpoint + find-or-create/link + wiring + tests (T4), web API/provider (T5), GoogleButton + modal (T6), env/docs/setup (T7). Link-by-email and the three branches are in T4's tests. Optional-via-env (503 / hidden button) covered in T4 + T6.
- **Type consistency:** `GoogleIdentity{Sub,Email,Name,EmailVerified}` and `GoogleVerifier.Verify` identical across T1/T3/T4; `NewAuthHandler(store, email, google, cfg)` arity updated in T4 (handler + `testApp` + `main.go`); `CreateVerifiedUser(name, email)` / `MarkVerifiedByEmail(email)` identical across T1/T2/T4; web `googleLogin(credential)` identical across T5/T6; error strings match the Global Constraints list.
- **No placeholders:** every code step is complete; commands include expected output.
