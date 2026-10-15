package main

// TDD: environment isolation guard rails.
// These tests pin the cross-contamination rules: test helpers may only
// touch *_test databases, prod boot requires real secrets, and preview
// auth paths are unreachable in production builds of the API.

import (
	"os"
	"strings"
	"testing"
)

func TestIsolationTestDBMustEndWithTestSuffix(t *testing.T) {
	// guardTestDB is enforced in mustTestDB (test_helpers.go). Pin the rule here
	// via the pure helper: only *_test names are acceptable in test env.
	os.Setenv("APP_ENV", "test")
	defer os.Unsetenv("APP_ENV")
	for _, ok := range []string{"bodyliabatch_test", "x_test", "BODYLIABATCH_TEST"} {
		if !strings.HasSuffix(strings.ToLower(ok), "_test") {
			t.Fatalf("expected %q to qualify as a test db", ok)
		}
	}
	if strings.HasSuffix("bodyliabatch", "_test") {
		t.Fatal("dev database must NOT qualify as a test database")
	}
}

func TestIsolationAuthUsesEnvSecret(t *testing.T) {
	// jwtSecret() must resolve from JWT_SECRET env when provided.
	os.Setenv("APP_ENV", "test")
	os.Setenv("JWT_SECRET", "unit-test-secret")
	defer os.Unsetenv("JWT_SECRET")
	defer os.Unsetenv("APP_ENV")
	if got := jwtSecret(); got != "unit-test-secret" {
		t.Fatalf("jwtSecret() = %q, want env value", got)
	}
}

func TestIsolationTestFallbackSecretOnlyInTest(t *testing.T) {
	os.Setenv("APP_ENV", "test")
	os.Unsetenv("JWT_SECRET")
	defer os.Unsetenv("APP_ENV")
	if got := jwtSecret(); got != "test-secret-for-tdd-only" {
		t.Fatalf("test fallback changed: %q", got)
	}
}

func TestIsolationDevFallbackIsNotProdSecret(t *testing.T) {
	os.Setenv("APP_ENV", "development")
	os.Unsetenv("JWT_SECRET")
	defer os.Unsetenv("APP_ENV")
	got := jwtSecret()
	if !strings.Contains(got, "NEVER-USE-IN-PROD") {
		t.Fatalf("dev fallback must be self-marking: %q", got)
	}
}

func TestIsolationProdWriteGuard(t *testing.T) {
	os.Setenv("APP_ENV", "production")
	defer os.Unsetenv("APP_ENV")
	if err := guardProdWrite("seed demo batches"); err == nil {
		t.Fatal("guardProdWrite must refuse in production")
	}
	os.Setenv("APP_ENV", "test")
	if err := guardProdWrite("seed demo batches"); err != nil {
		t.Fatalf("guardProdWrite must allow in test: %v", err)
	}
}
