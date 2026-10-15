package main

// TDD RED PHASE — public BFF contract tests for batch.bodylia.in.
// MUST fail until handlers exist, then pass (green).
// Run: DB_NAME=bodyliabatch_test go test -run TestPublic -v

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"os"
	"testing"
)

func testRouter(t *testing.T) *ginEngine {
	t.Helper()
	// Isolation: contract tests ALWAYS target the *_test database and ALWAYS
	// set APP_ENV=test (guardTestDB refuses anything else — see env_guard.go).
	os.Setenv("APP_ENV", "test")
	os.Setenv("DB_NAME", "bodyliabatch_test")
	os.Setenv("DB_USER", "roshanshah")
	os.Setenv("DB_HOST", "localhost")
	os.Setenv("JWT_SECRET", "test-secret-for-tdd-only")
	db := mustTestDB(t)
	resetTestDB(t, db)
	return newRouter(db)
}

func doReq(t *testing.T, r *ginEngine, method, path string, body any, token string) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func decodeBody(t *testing.T, w *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.Unmarshal(w.Body.Bytes(), v); err != nil {
		t.Fatalf("invalid JSON (%d): %s", w.Code, w.Body.String())
	}
}

func TestPublicHealth(t *testing.T) {
	r := testRouter(t)
	w := doReq(t, r, "GET", "/api/health", nil, "")
	if w.Code != 200 {
		t.Fatalf("health = %d, want 200", w.Code)
	}
	var out map[string]any
	decodeBody(t, w, &out)
	if out["status"] != "healthy" {
		t.Fatalf("health status = %v", out)
	}
}

func TestPublicLookupCanonicalGenuine(t *testing.T) {
	r := testRouter(t)
	w := doReq(t, r, "GET", "/bff/v1/batches/BDL-FR-2509-0312", nil, "")
	if w.Code != 200 {
		t.Fatalf("lookup = %d: %s", w.Code, w.Body.String())
	}
	var out map[string]any
	decodeBody(t, w, &out)
	if out["kind"] != "genuine" {
		t.Fatalf("kind = %v, want genuine", out)
	}
	rec := out["record"].(map[string]any)
	if rec["batch"] != "BDL-FR-2509-0312" {
		t.Fatalf("record.batch = %v", rec["batch"])
	}
}

func TestPublicLookupAliasResolves(t *testing.T) {
	r := testRouter(t)
	for _, alias := range []string{"FR-2509-312", "fr25090312", "VND-FR-0312"} {
		w := doReq(t, r, "GET", "/bff/v1/batches/"+alias, nil, "")
		if w.Code != 200 {
			t.Fatalf("alias %s = %d: %s", alias, w.Code, w.Body.String())
		}
		var out map[string]any
		decodeBody(t, w, &out)
		if out["kind"] != "genuine" {
			t.Fatalf("alias %s kind = %v", alias, out)
		}
		rec := out["record"].(map[string]any)
		if rec["batch"] != "BDL-FR-2509-0312" {
			t.Fatalf("alias %s record.batch = %v", alias, rec["batch"])
		}
		if out["matchedAlias"] == nil || out["matchedAlias"] == "" {
			t.Fatalf("alias %s missing matchedAlias", alias)
		}
	}
}

func TestPublicLookupExpiredRecalledNotFound(t *testing.T) {
	r := testRouter(t)
	w := doReq(t, r, "GET", "/bff/v1/batches/BDL-MB-2203-0045", nil, "")
	var out map[string]any
	decodeBody(t, w, &out)
	if out["kind"] != "expired" {
		t.Fatalf("expired kind = %v", out)
	}
	w = doReq(t, r, "GET", "/bff/v1/batches/BDL-PH-2504-0777", nil, "")
	decodeBody(t, w, &out)
	if out["kind"] != "recalled" {
		t.Fatalf("recalled kind = %v", out)
	}
	w = doReq(t, r, "GET", "/bff/v1/batches/BDL-FN-2501-0001", nil, "")
	if w.Code != 404 {
		t.Fatalf("not-found = %d, want 404", w.Code)
	}
}

func TestPublicSubmitAndTrackReport(t *testing.T) {
	r := testRouter(t)
	w := doReq(t, r, "POST", "/bff/v1/reports", map[string]any{
		"fullName": "TDD User", "email": "tdd@example.com",
		"batch": "FR-2509-312", "channel": "Amazon",
		"message": "This is a TDD report with at least twenty characters.",
		"consent": true,
	}, "")
	if w.Code != 201 {
		t.Fatalf("submit = %d: %s", w.Code, w.Body.String())
	}
	var created map[string]any
	decodeBody(t, w, &created)
	ref, _ := created["reference"].(string)
	if len(ref) < 10 {
		t.Fatalf("reference = %v", created)
	}
	w = doReq(t, r, "POST", "/bff/v1/reports/track",
		map[string]any{"reference": ref, "email": "tdd@example.com"}, "")
	if w.Code != 200 {
		t.Fatalf("track = %d: %s", w.Code, w.Body.String())
	}
	var tracked map[string]any
	decodeBody(t, w, &tracked)
	if tracked["found"] != true {
		t.Fatalf("track found = %v", tracked)
	}
	w = doReq(t, r, "POST", "/bff/v1/reports/track",
		map[string]any{"reference": ref, "email": "stranger@example.com"}, "")
	var denied map[string]any
	decodeBody(t, w, &denied)
	if denied["found"] != false {
		t.Fatalf("track leak = %v", denied)
	}
}

func TestPublicRecallsList(t *testing.T) {
	r := testRouter(t)
	w := doReq(t, r, "GET", "/bff/v1/recalls", nil, "")
	if w.Code != 200 {
		t.Fatalf("recalls = %d", w.Code)
	}
	var out []any
	decodeBody(t, w, &out)
	if len(out) == 0 {
		t.Fatal("expected at least one recall")
	}
}
