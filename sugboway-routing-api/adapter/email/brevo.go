package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"time"
)

// brevoEndpoint is Brevo's transactional email API. A var so tests can override it.
var brevoEndpoint = "https://api.brevo.com/v3/smtp/email"

// BrevoSender sends verification email via Brevo's HTTPS API. Unlike SMTP, this
// works on hosts that block outbound SMTP ports (e.g. Render).
type BrevoSender struct {
	APIKey    string
	FromName  string
	FromEmail string
	client    *http.Client
}

// NewBrevoSender builds a Brevo-backed email sender. `from` may be a bare
// address ("x@y.com") or the display form ("SugboWay <x@y.com>").
func NewBrevoSender(apiKey, from string) *BrevoSender {
	name, addr := "SugboWay", from
	if parsed, err := mail.ParseAddress(from); err == nil {
		addr = parsed.Address
		if parsed.Name != "" {
			name = parsed.Name
		}
	}
	return &BrevoSender{
		APIKey:    apiKey,
		FromName:  name,
		FromEmail: addr,
		client:    &http.Client{Timeout: 15 * time.Second},
	}
}

type brevoAddr struct {
	Name  string `json:"name,omitempty"`
	Email string `json:"email"`
}

type brevoPayload struct {
	Sender      brevoAddr   `json:"sender"`
	To          []brevoAddr `json:"to"`
	Subject     string      `json:"subject"`
	TextContent string      `json:"textContent"`
}

// SendVerification posts a verification email to Brevo's API.
func (s *BrevoSender) SendVerification(ctx context.Context, to, verifyURL string) error {
	if s.APIKey == "" {
		return fmt.Errorf("brevo not configured: BREVO_API_KEY is empty")
	}
	payload := brevoPayload{
		Sender:  brevoAddr{Name: s.FromName, Email: s.FromEmail},
		To:      []brevoAddr{{Email: to}},
		Subject: "Verify your SugboWay account",
		TextContent: fmt.Sprintf(
			"Maayong adlaw!\n\nConfirm your SugboWay account by opening this link:\n%s\n\n"+
				"The link expires in 24 hours. If you didn't sign up, ignore this email.\n\n"+
				"— SugboWay, Cebu transit made simple",
			verifyURL,
		),
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("brevo marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, brevoEndpoint, bytes.NewReader(buf))
	if err != nil {
		return fmt.Errorf("brevo request: %w", err)
	}
	req.Header.Set("api-key", s.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("brevo send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return fmt.Errorf("brevo api %d: %s", resp.StatusCode, string(msg))
}
