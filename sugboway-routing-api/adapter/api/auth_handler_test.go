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
