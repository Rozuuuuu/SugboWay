package domain

import (
	"testing"
	"time"
)

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
