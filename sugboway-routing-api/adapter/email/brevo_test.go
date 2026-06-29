package email

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestBrevoSenderPostsExpectedRequest verifies the sender authenticates with the
// api-key header and posts a well-formed payload, and that a 2xx is success.
func TestBrevoSenderPostsExpectedRequest(t *testing.T) {
	var gotKey string
	var gotBody brevoPayload

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.Header.Get("api-key")
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &gotBody)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"messageId":"<abc@brevo>"}`))
	}))
	defer srv.Close()

	orig := brevoEndpoint
	brevoEndpoint = srv.URL
	defer func() { brevoEndpoint = orig }()

	s := NewBrevoSender("secret-key", "SugboWay <no-reply@sugboway.app>")
	err := s.SendVerification(context.Background(), "rider@example.com", "https://api/verify?token=xyz")
	if err != nil {
		t.Fatalf("send => nil error, got %v", err)
	}
	if gotKey != "secret-key" {
		t.Errorf("api-key header => secret-key, got %q", gotKey)
	}
	if gotBody.Sender.Email != "no-reply@sugboway.app" || gotBody.Sender.Name != "SugboWay" {
		t.Errorf("sender => SugboWay <no-reply@sugboway.app>, got %+v", gotBody.Sender)
	}
	if len(gotBody.To) != 1 || gotBody.To[0].Email != "rider@example.com" {
		t.Errorf("recipient => rider@example.com, got %+v", gotBody.To)
	}
	if gotBody.Subject == "" || !strings.Contains(gotBody.TextContent, "https://api/verify?token=xyz") {
		t.Errorf("expected subject + verify link in body, got subject=%q body=%q", gotBody.Subject, gotBody.TextContent)
	}
}

// TestBrevoSenderReturnsErrorOnNon2xx ensures API errors surface (so the handler logs them).
func TestBrevoSenderReturnsErrorOnNon2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"invalid api key"}`))
	}))
	defer srv.Close()

	orig := brevoEndpoint
	brevoEndpoint = srv.URL
	defer func() { brevoEndpoint = orig }()

	s := NewBrevoSender("bad-key", "x@y.com")
	if err := s.SendVerification(context.Background(), "rider@example.com", "https://api/verify"); err == nil {
		t.Error("non-2xx response => error, got nil")
	}
}

func TestBrevoSenderRequiresAPIKey(t *testing.T) {
	s := NewBrevoSender("", "x@y.com")
	if err := s.SendVerification(context.Background(), "rider@example.com", "https://api/verify"); err == nil {
		t.Error("empty api key => error, got nil")
	}
}
