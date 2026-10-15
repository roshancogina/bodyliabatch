package main

// Environment identity and guard rails.
//
// APP_ENV is the single switch: development | test | production.
//   - development: local work, DB bodyliabatch, preview auth allowed.
//   - test:        Go contract + Playwright, DB bodyliabatch_test (or *_test suffix enforced).
//   - production:  live data. Seed endpoints, mock auth, and *-only* CORS are disabled.
// APP_ENV defaults to development so a bare `go run .` can never touch prod.

import (
	"fmt"
	"log"
	"os"
	"strings"
)

type AppEnv string

const (
	EnvDevelopment AppEnv = "development"
	EnvTest        AppEnv = "test"
	EnvProduction  AppEnv = "production"
)

func currentEnv() AppEnv {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV"))) {
	case "production", "prod":
		return EnvProduction
	case "test", "testing":
		return EnvTest
	default:
		return EnvDevelopment
	}
}

func isProd() bool { return currentEnv() == EnvProduction }
func isTest() bool { return currentEnv() == EnvTest }

// requireEnv aborts boot when a mandatory variable is missing.
func requireEnv(key string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		log.Fatalf("FATAL: %s is required (APP_ENV=%s). See backend-go/.env.example", key, currentEnv())
	}
	return v
}

// jwtSecret: production MUST provide JWT_SECRET via env (no fallback).
// Dev/test keep a per-env fallback so local boot stays frictionless.
func jwtSecret() string {
	if s := strings.TrimSpace(os.Getenv("JWT_SECRET")); s != "" {
		return s
	}
	if isProd() {
		log.Fatal("FATAL: JWT_SECRET is required in production. Refusing to boot with a fallback secret.")
	}
	if isTest() {
		return "test-secret-for-tdd-only"
	}
	return "batch-bodylia-dev-secret-NEVER-USE-IN-PROD"
}

// guardTestDB refuses to run test helpers against a non-test database.
func guardTestDB(name string) {
	if isProd() {
		log.Fatalf("FATAL: test helper invoked with APP_ENV=production (db=%s). Refusing.", name)
	}
	if !strings.HasSuffix(strings.ToLower(name), "_test") {
		log.Fatalf("FATAL: test database must end in _test (got %q). Refusing to wipe seed data.", name)
	}
}

// guardProdWrite blocks seed/reset/destructive ops outside dev/test.
func guardProdWrite(op string) error {
	if isProd() {
		return fmt.Errorf("forbidden in production: %s (APP_ENV=production)", op)
	}
	return nil
}

// isTestDatabase reports whether a DB name belongs to the test family.
func isTestDatabase(name string) bool {
	l := strings.ToLower(strings.TrimSpace(name))
	return strings.HasSuffix(l, "_test") || strings.HasSuffix(l, "-test") ||
		strings.Contains(l, "test_") || strings.Contains(l, "_test_")
}
