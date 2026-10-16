package main

// Self-hosted proof-of-work captcha (Altcha-style) - server mirror of src/lib/captcha.ts.
// No external service: challenge = salt + expiry + HMAC(secret, salt|expiry).
// Client brute-forces `number` s.t. SHA-256("salt:number") has DIFFICULTY
// leading zero nibbles. Verify re-checks HMAC, expiry, range, and the hash.
//
// Secrets: CAPTCHA_SECRET via env (per-env fallback, never committed).
// Test bypass: APP_ENV=test AND CAPTCHA_BYPASS=1 (Playwright only).

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

const (
	captchaDifficulty = 3
	captchaTTL        = 2 * time.Minute
	captchaMaxNumber  = 100_000
)

type captchaChallenge struct {
	Algorithm string `json:"algorithm"`
	Salt      string `json:"salt"`
	MaxNumber int    `json:"maxNumber"`
	Signature string `json:"signature"`
	ExpiresAt int64  `json:"expiresAt"`
}

type captchaSolution struct {
	Algorithm string `json:"algorithm"`
	Salt      string `json:"salt"`
	Number    int    `json:"number"`
	Signature string `json:"signature"`
	ExpiresAt int64  `json:"expiresAt"`
}

func captchaSecret() string {
	if s := strings.TrimSpace(os.Getenv("CAPTCHA_SECRET")); s != "" {
		return s
	}
	if isProd() {
		log.Fatal("FATAL: CAPTCHA_SECRET is required in production. Refusing to boot with a fallback secret.")
	}
	if isTest() {
		return "test-captcha-secret-for-tdd-only"
	}
	return "batch-bodylia-dev-captcha-NEVER-USE-IN-PROD"
}

func signCaptchaChallenge(secret, salt string, expiresAt int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(fmt.Sprintf("%s|%d", salt, expiresAt)))
	return hex.EncodeToString(mac.Sum(nil))
}

func newCaptchaChallenge(secret string, now time.Time) captchaChallenge {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Sprintf("captcha rand: %v", err))
	}
	salt := hex.EncodeToString(b[:])
	exp := now.Add(captchaTTL).UnixMilli()
	return captchaChallenge{
		Algorithm: "SHA-256", Salt: salt, MaxNumber: captchaMaxNumber,
		Signature: signCaptchaChallenge(secret, salt, exp), ExpiresAt: exp,
	}
}

func captchaBypassed() bool {
	return isTest() && strings.TrimSpace(os.Getenv("CAPTCHA_BYPASS")) == "1"
}

// verifyCaptchaToken re-checks HMAC, expiry, range, and the proof-of-work hash.
func verifyCaptchaToken(secret, raw string, now time.Time) (ok bool, reason string) {
	if captchaBypassed() {
		return true, ""
	}
	if strings.TrimSpace(raw) == "" {
		return false, "missing"
	}
	var p captchaSolution
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return false, "invalid"
	}
	if p.Algorithm != "SHA-256" || p.Salt == "" || p.Signature == "" || p.ExpiresAt == 0 {
		return false, "invalid"
	}
	if p.ExpiresAt <= now.UnixMilli() {
		return false, "expired"
	}
	if signCaptchaChallenge(secret, p.Salt, p.ExpiresAt) != p.Signature {
		return false, "invalid"
	}
	if p.Number < 0 || p.Number >= captchaMaxNumber {
		return false, "invalid"
	}
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s:%d", p.Salt, p.Number)))
	digest := hex.EncodeToString(sum[:])
	if !strings.HasPrefix(digest, strings.Repeat("0", captchaDifficulty)) {
		return false, "invalid"
	}
	return true, ""
}

func captchaErrorMessage(reason string) string {
	switch reason {
	case "missing":
		return "Please complete the human check before submitting."
	case "expired":
		return "The security check expired - it refreshes automatically, just try again."
	default:
		return "We could not confirm you are human - please try the check again."
	}
}
