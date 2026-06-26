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
