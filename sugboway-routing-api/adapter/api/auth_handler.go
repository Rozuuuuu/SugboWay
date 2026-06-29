package api

import (
	"context"
	"log"
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
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func validEmail(e string) bool {
	return strings.Contains(e, "@") && strings.Contains(e, ".") && len(e) <= 254
}

func userJSON(u *domain.User) fiber.Map {
	return fiber.Map{"name": u.Name, "email": u.Email, "tier": u.Tier}
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
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "missing_name"})
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
	if _, err := h.store.CreateUser(c.Context(), in.Name, in.Email, hash, tokenHash, time.Now().Add(h.cfg.VerifyTTL)); err != nil {
		return c.Status(409).JSON(fiber.Map{"error": "email_taken"})
	}
	// Send the verification email in the background. SMTP can be slow or blocked
	// (especially on PaaS hosts), so sending it inline would make this request
	// hang. The account already exists; failures are logged for diagnosis and the
	// user can use "Resend". A fresh context is used since the request's ends here.
	verifyURL := h.verifyURL(raw)
	go func(email, url string) {
		if err := h.email.SendVerification(context.Background(), email, url); err != nil {
			log.Printf("[auth] verification email to %s failed: %v", email, err)
		} else {
			log.Printf("[auth] verification email sent to %s", email)
		}
	}(in.Email, verifyURL)

	return c.Status(202).JSON(fiber.Map{"status": "verify_email"})
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
	// Re-fetch so the returned user reflects live DB state (tier + name).
	u, err := h.store.GetUserByEmail(c.Context(), claims.Email)
	if err != nil || u == nil {
		u = &domain.User{ID: userID, Email: claims.Email, Tier: in.Plan}
	}
	return h.issue(c, u)
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
