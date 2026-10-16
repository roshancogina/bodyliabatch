package main

// TDD: captcha contract for guest-write endpoints + challenge issuance.
// RED: fails until GET /bff/v1/captcha/challenge exists and POST /bff/v1/reports
// + POST /bff/v1/reports/track enforce PoW tokens (403 without, 201/200 with).
// Bypass: APP_ENV=test + CAPTCHA_BYPASS=1 skips verification (Playwright only).

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

// solveTestCaptcha brute-forces the PoW the same way the browser widget does.
func solveTestCaptcha(t *testing.T, ch captchaChallenge) string {
	t.Helper()
	for n := 0; n < ch.MaxNumber; n++ {
		sum := sha256.Sum256([]byte(fmt.Sprintf("%s:%d", ch.Salt, n)))
		if strings.HasPrefix(hex.EncodeToString(sum[:]), strings.Repeat("0", captchaDifficulty)) {
			raw, err := json.Marshal(captchaSolution{
				Algorithm: "SHA-256", Salt: ch.Salt, Number: n,
				Signature: ch.Signature, ExpiresAt: ch.ExpiresAt,
			})
			if err != nil {
				t.Fatal(err)
			}
			return string(raw)
		}
	}
	t.Fatalf("no PoW solution found for salt %s", ch.Salt)
	return ""
}

func fetchChallenge(t *testing.T, r *ginEngine) captchaChallenge {
	t.Helper()
	w := doReq(t, r, "GET", "/bff/v1/captcha/challenge", nil, "")
	if w.Code != 200 {
		t.Fatalf("challenge = %d: %s", w.Code, w.Body.String())
	}
	var ch captchaChallenge
	decodeBody(t, w, &ch)
	if ch.Salt == "" || ch.Signature == "" || ch.ExpiresAt <= time.Now().UnixMilli() {
		t.Fatalf("bad challenge: %+v", ch)
	}
	if ch.Algorithm != "SHA-256" || ch.MaxNumber != captchaMaxNumber {
		t.Fatalf("bad challenge fields: %+v", ch)
	}
	return ch
}

func TestCaptchaChallengeIssuesSignedChallenge(t *testing.T) {
	r := testRouter(t)
	ch := fetchChallenge(t, r)
	if signCaptchaChallenge(captchaSecret(), ch.Salt, ch.ExpiresAt) != ch.Signature {
		t.Fatal("challenge signature does not verify against server secret")
	}
}

func TestCaptchaReportRequiresToken(t *testing.T) {
	r := testRouter(t)
	body := map[string]any{
		"fullName": "TDD User", "email": "tdd-captcha@example.com",
		"batch": "2K26001", "channel": "Amazon",
		"message": "This is a TDD report with at least twenty characters.",
		"consent": true,
	}
	w := doReq(t, r, "POST", "/bff/v1/reports", body, "")
	if w.Code != 403 {
		t.Fatalf("report without captcha = %d, want 403", w.Code)
	}
	w = doReq(t, r, "POST", "/bff/v1/reports", withCaptcha(body, "bogus-token"), "")
	if w.Code != 403 {
		t.Fatalf("report with bogus captcha = %d, want 403", w.Code)
	}
	ch := fetchChallenge(t, r)
	w = doReq(t, r, "POST", "/bff/v1/reports", withCaptcha(body, solveTestCaptcha(t, ch)), "")
	if w.Code != 201 {
		t.Fatalf("report with solved captcha = %d: %s", w.Code, w.Body.String())
	}
	var created map[string]any
	decodeBody(t, w, &created)
	if created["reference"] == nil || created["reference"] == "" {
		t.Fatalf("no reference: %v", created)
	}
}

func TestCaptchaTrackRequiresToken(t *testing.T) {
	r := testRouter(t)
	ch := fetchChallenge(t, r)
	tok := solveTestCaptcha(t, ch)
	body := map[string]any{
		"fullName": "TDD Track", "email": "tdd-track@example.com",
		"batch": "2K26002", "channel": "Amazon",
		"message": "This is a TDD track report with enough characters.",
		"consent": true,
	}
	w := doReq(t, r, "POST", "/bff/v1/reports", withCaptcha(body, tok), "")
	var created map[string]any
	decodeBody(t, w, &created)
	ref, _ := created["reference"].(string)

	track := map[string]any{"reference": ref, "email": "tdd-track@example.com"}
	w = doReq(t, r, "POST", "/bff/v1/reports/track", track, "")
	if w.Code != 403 {
		t.Fatalf("track without captcha = %d, want 403", w.Code)
	}
	ch2 := fetchChallenge(t, r)
	w = doReq(t, r, "POST", "/bff/v1/reports/track", withCaptcha(track, solveTestCaptcha(t, ch2)), "")
	if w.Code != 200 {
		t.Fatalf("track with solved captcha = %d: %s", w.Code, w.Body.String())
	}
	var out map[string]any
	decodeBody(t, w, &out)
	if out["found"] != true {
		t.Fatalf("track found = %v", out)
	}
}

func TestCaptchaBypassOnlyWithExplicitFlag(t *testing.T) {
	r := testRouter(t)
	body := map[string]any{
		"fullName": "TDD User", "email": "tdd-bypass@example.com",
		"batch": "2K26001", "channel": "Amazon",
		"message": "This is a TDD report with at least twenty characters.",
		"consent": true,
	}
	// No flag: must reject even in test env.
	w := doReq(t, r, "POST", "/bff/v1/reports", body, "")
	if w.Code != 403 {
		t.Fatalf("report without flag = %d, want 403", w.Code)
	}
}

func TestCaptchaLoginRequiresToken(t *testing.T) {
	r := testRouter(t)
	body := map[string]any{"email": "admin@bodylia.in", "password": "Bodylia@2026"}
	w := doReq(t, r, "POST", "/api/auth/login", body, "")
	if w.Code != 403 {
		t.Fatalf("login without captcha = %d, want 403", w.Code)
	}
	w = doReq(t, r, "POST", "/api/auth/login", withCaptcha(body, "bogus-token"), "")
	if w.Code != 403 {
		t.Fatalf("login with bogus captcha = %d, want 403", w.Code)
	}
	w = doReq(t, r, "POST", "/api/auth/login", withCaptcha(body, solveTestCaptcha(t, fetchChallenge(t, r))), "")
	if w.Code != 200 {
		t.Fatalf("login with solved captcha = %d: %s", w.Code, w.Body.String())
	}
}

func withCaptcha(body map[string]any, token string) map[string]any {
	out := make(map[string]any, len(body)+1)
	for k, v := range body {
		out[k] = v
	}
	out["captchaToken"] = token
	return out
}
