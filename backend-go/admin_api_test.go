package main

// TDD RED PHASE — admin API contract tests (JWT + batches + aliases).
// Run: DB_NAME=bodyliabatch_test go test -run TestAdmin -v

import (
	"fmt"
	"os"
	"testing"
)

func adminToken(t *testing.T, r *ginEngine) string {
	t.Helper()
	w := doReq(t, r, "POST", "/api/auth/login",
		withCaptcha(map[string]any{"email": "admin@bodylia.in", "password": "Bodylia@2026"}, solveTestCaptcha(t, fetchChallenge(t, r))), "")
	if w.Code != 200 {
		t.Fatalf("login = %d: %s", w.Code, w.Body.String())
	}
	var out map[string]any
	decodeBody(t, w, &out)
	tok, _ := out["token"].(string)
	if tok == "" {
		t.Fatalf("no token: %v", out)
	}
	return tok
}

func TestAdminLoginAndMe(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)
	w := doReq(t, r, "GET", "/api/admin/me", nil, tok)
	if w.Code != 200 {
		t.Fatalf("me = %d: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "GET", "/api/admin/me", nil, "")
	if w.Code != 401 {
		t.Fatalf("unauthenticated me = %d, want 401", w.Code)
	}
}

func TestAdminBatchesSearchByAlias(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)
	w := doReq(t, r, "GET", "/api/admin/batches?q=2K26005", nil, tok)
	if w.Code != 200 {
		t.Fatalf("admin search = %d: %s", w.Code, w.Body.String())
	}
	var out []any
	decodeBody(t, w, &out)
	found := false
	for _, item := range out {
		if m, ok := item.(map[string]any); ok && m["batch"] == "CI-2610-WL01" {
			found = true
		}
	}
	if !found {
		t.Fatalf("alias search missed CI-2610-WL01: %s", w.Body.String())
	}
}

func TestAdminRegisterBatchWithAliases(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)
	batch := fmt.Sprintf("PE-2601-WL%02d", os.Getpid()%100)
	payload := map[string]any{
		"batch": batch, "product": "PE",
		"manufactured": "2026-01-05", "expires": "2028-01-04",
		"facility": "Unit 2, Baddi, Himachal Pradesh",
		"lab":      "Eurofins Analytical Services India, Bengaluru",
		"aliases":  []string{"TDD-MFG-001"},
		"coa":      []any{map[string]any{"test": "Assay (active)", "specification": "18 mg ± 10 %", "result": "18.1 mg", "pass": true}},
	}
	w := doReq(t, r, "POST", "/api/admin/batches", payload, tok)
	if w.Code != 201 {
		t.Fatalf("register = %d: %s", w.Code, w.Body.String())
	}
	w2 := doReq(t, r, "GET", "/bff/v1/batches/TDD-MFG-001", nil, "")
	var out map[string]any
	decodeBody(t, w2, &out)
	if out["kind"] != "genuine" {
		t.Fatalf("new alias lookup = %v", out)
	}
	w3 := doReq(t, r, "POST", "/api/admin/batches", payload, tok)
	if w3.Code != 409 && w3.Code != 400 {
		t.Fatalf("duplicate alias = %d, want 409/400: %s", w3.Code, w3.Body.String())
	}
}

// Contract: staff can change their own password (used by My account in the
// console), wrong current password and weak candidates are rejected, and the
// change actually takes effect on the next login.
func TestAdminChangePassword(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)

	w := doReq(t, r, "POST", "/api/auth/password",
		map[string]any{"current": "nope", "password": "BrandNewPassw0rd!"}, "")
	if w.Code != 401 {
		t.Fatalf("unauthenticated change = %d, want 401", w.Code)
	}
	w = doReq(t, r, "POST", "/api/auth/password",
		map[string]any{"current": "WrongOne1!", "password": "BrandNewPassw0rd!"}, tok)
	if w.Code != 400 {
		t.Fatalf("wrong current = %d, want 400: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "POST", "/api/auth/password",
		map[string]any{"current": "Bodylia@2026", "password": "short"}, tok)
	if w.Code != 400 {
		t.Fatalf("weak new password = %d, want 400: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "POST", "/api/auth/password",
		map[string]any{"current": "Bodylia@2026", "password": "Bodylia@2026"}, tok)
	if w.Code != 400 {
		t.Fatalf("same-as-current = %d, want 400: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "POST", "/api/auth/password",
		map[string]any{"current": "Bodylia@2026", "password": "BrandNewPassw0rd!"}, tok)
	if w.Code != 200 {
		t.Fatalf("change = %d, want 200: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "POST", "/api/auth/login",
		withCaptcha(map[string]any{"email": "admin@bodylia.in", "password": "Bodylia@2026"},
			solveTestCaptcha(t, fetchChallenge(t, r))), "")
	if w.Code != 401 {
		t.Fatalf("old password after change = %d, want 401: %s", w.Code, w.Body.String())
	}
	// Restore the shared seed password (policy-compliant) for later tests.
	w = doReq(t, r, "POST", "/api/auth/password",
		map[string]any{"current": "BrandNewPassw0rd!", "password": "Bodylia@2026"}, tok)
	if w.Code != 200 {
		t.Fatalf("restore = %d, want 200: %s", w.Code, w.Body.String())
	}
}
