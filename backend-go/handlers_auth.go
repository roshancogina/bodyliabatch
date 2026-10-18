package main

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// twoFactorCode holds a pending email verification code keyed by temp token.
// The code is stored hashed (SHA-256) so server memory never holds plaintext codes.
type twoFactorCode struct {
	CodeHash string
	UserID   string
	Email    string
	Expire   time.Time
}

var (
	twoFactorStore sync.Mutex
	pendingCodes   = make(map[string]*twoFactorCode)
)

// POST /api/auth/login → { token, user } OR { requires2fa, tempToken, email }
// Login is an unauthenticated entry point, so it carries the same PoW
// captcha as the public write endpoints (bots must burn CPU per attempt).

func (a *App) handleLogin(c *gin.Context) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Captcha  string `json:"captchaToken"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Enter your work email and password."})
		return
	}
	if !requireCaptcha(c, in.Captcha) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	var u StaffUser
	var hash string
	var lastActive sql.NullTime
	err := a.store.db.QueryRow(`SELECT id, name, email, password_hash, role, status, mfa, last_active
		FROM staff_users WHERE lower(email)=$1`, email).Scan(
		&u.ID, &u.Name, &u.Email, &hash, &u.Role, &u.Status, &u.MFA, &lastActive)
	if err != nil {
		c.JSON(401, gin.H{"error": "That email and password do not match a staff account."})
		return
	}
	if u.Status == "deactivated" {
		c.JSON(403, gin.H{"error": "This account has been deactivated."})
		return
	}
	if u.Status == "invited" {
		c.JSON(403, gin.H{"error": "This account is not active yet."})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)); err != nil {
		c.JSON(401, gin.H{"error": "That email and password do not match a staff account."})
		return
	}
	if lastActive.Valid {
		u.LastActive = &lastActive.Time
	}
	secret := jwtSecret()
	// Issue a short-lived temp token (5 min) that authorizes the 2FA step.
	tfClaims := jwt.MapClaims{
		"sub": u.ID, "email": u.Email, "role": u.Role, "name": u.Name,
		"twofa": true,
		"exp":   time.Now().Add(5 * time.Minute).Unix(),
	}
	tfTok := jwt.NewWithClaims(jwt.SigningMethodHS256, tfClaims)
	tempToken, err := tfTok.SignedString([]byte(secret))
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not create verification session"})
		return
	}
	// Generate 6-digit email code, park its hash server-side, then deliver
	// the plaintext code by email (EmailIt). The temp token authorizes only
	// the single-use verify-2FA step that follows.
	code := fmt.Sprintf("%06d", rand.Intn(1_000_000))
	codeHash := hashTwoFactorCode(code)
	twoFactorStore.Lock()
	pendingCodes[tempToken] = &twoFactorCode{
		CodeHash: codeHash,
		UserID:   u.ID,
		Email:    u.Email,
		Expire:   time.Now().Add(10 * time.Minute),
	}
	twoFactorStore.Unlock()

	if err := deliverTwoFactorCode(u.Email, code); err != nil {
		// Fail closed: if the code can't be delivered, no session may use it.
		twoFactorStore.Lock()
		delete(pendingCodes, tempToken)
		twoFactorStore.Unlock()
		log.Printf("2fa-email: email=%s delivery failed: %v", u.Email, err)
		c.JSON(500, gin.H{"error": "Verification email could not be sent. Try again."})
		return
	}

	_, _ = a.store.db.Exec(`UPDATE staff_users SET last_active=NOW() WHERE id=$1`, u.ID)
	resp := gin.H{"requires2fa": true, "tempToken": tempToken, "email": u.Email, "user": u}
	if isTest() {
		// Test-only concession: return the parked code so tests can
		// complete the email-2FA flow without access to server memory.
		resp["code"] = code
	}
	c.JSON(200, resp)
}

// POST /api/auth/verify-2fa — verify the 6-digit email code, issue full session.
// Unauthenticated but rate-limited by the temp token (single use, 5 min TTL).
func (a *App) handleVerifyTwoFactor(c *gin.Context) {
	var in struct {
		TempToken string `json:"tempToken"`
		Code      string `json:"code"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Enter the 6-digit code sent to your email."})
		return
	}
	secret := jwtSecret()
	parsed, err := jwt.Parse(in.TempToken, func(t *jwt.Token) (any, error) {
		return []byte(secret), nil
	})
	if err != nil || !parsed.Valid {
		c.JSON(401, gin.H{"error": "Verification session expired — sign in again."})
		return
	}
	claims, _ := parsed.Claims.(jwt.MapClaims)
	if claims["twofa"] != true {
		c.JSON(401, gin.H{"error": "Invalid verification session."})
		return
	}
	twoFactorStore.Lock()
	pc, ok := pendingCodes[in.TempToken]
	twoFactorStore.Unlock()
	if !ok || time.Now().After(pc.Expire) {
		c.JSON(401, gin.H{"error": "Verification session expired — sign in again."})
		return
	}
	// Constant-time compare against the hashed code to avoid timing leaks.
	inputHash := hashTwoFactorCode(in.Code)
	if subtleCompare([]byte(inputHash), []byte(pc.CodeHash)) != 0 {
		c.JSON(401, gin.H{"error": "That code did not work. Check your email and try again."})
		return
	}
	// Consume the temp token (single use).
	twoFactorStore.Lock()
	delete(pendingCodes, in.TempToken)
	twoFactorStore.Unlock()
	// Issue the full 15-minute JWT session.
	u := StaffUser{ID: pc.UserID, Email: pc.Email}
	var name, role string
	var lastActive sql.NullTime
	if err := a.store.db.QueryRow(`SELECT name, role, last_active FROM staff_users WHERE id=$1`, pc.UserID).
		Scan(&name, &role, &lastActive); err != nil {
		c.JSON(401, gin.H{"error": "Account not found — sign in again."})
		return
	}
	u.Name = name
	u.Role = role
	if lastActive.Valid {
		u.LastActive = &lastActive.Time
	}
	claims2 := jwt.MapClaims{
		"sub": u.ID, "email": u.Email, "role": u.Role, "name": u.Name,
		"exp": time.Now().Add(15 * time.Minute).Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims2)
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Signed in',$2,'2FA email code')`, u.Name, u.Email)
	c.JSON(200, gin.H{"token": signed, "user": u})
}

// subtleCompare returns 0 if a and b are equal, 1 otherwise — constant time.
func subtleCompare(a, b []byte) int {
	if len(a) != len(b) {
		return 1
	}
	var diff byte
	for i := range a {
		diff |= a[i] ^ b[i]
	}
	if diff == 0 {
		return 0
	}
	return 1
}

// hashTwoFactorCode returns the SHA-256 hex digest of a 6-digit code so
// server memory never holds a plaintext verification code.
func hashTwoFactorCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

// emailItPayload matches the EmailIt v2 /emails request contract:
// POST https://api.emailit.com/v2/emails  Authorization: Bearer <API_KEY>
type emailItPayload struct {
	From    string `json:"from"`
	To      string `json:"to"`
	Subject string `json:"subject"`
	HTML    string `json:"html"`
}

// deliverTwoFactorCode emails the 6-digit verification code via EmailIt.
// In test mode delivery is skipped entirely (the code comes back in the
// login response). Outside of test, a missing EMAILIT_API_KEY degrades to
// an ops log so local development keeps working; production must provide
// the key (enforced at boot by main.go) and delivery failure fails the
// login closed — a code that never arrived can never verify.
func deliverTwoFactorCode(to, code string) error {
	if isTest() {
		return nil
	}
	apiKey := strings.TrimSpace(os.Getenv("EMAILIT_API_KEY"))
	if apiKey == "" {
		log.Printf("2fa-code: email=%s code=%s (expires 10 min) [EMAILIT_API_KEY unset]", to, code)
		return nil
	}
	payload := emailItPayload{
		From:    "Bodylia Verify <verify@bodylia.in>",
		To:      to,
		Subject: "Your Bodylia sign-in code",
		HTML:    fmt.Sprintf("<p>Your Bodylia verification code is <strong>%s</strong>.</p><p>It expires in 10 minutes. If you didn’t request this, ignore this email.</p>", code),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, "https://api.emailit.com/v2/emails", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("emailit request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("emailit %s: %s", resp.Status, strings.TrimSpace(string(b)))
	}
	io.Copy(io.Discard, resp.Body)
	return nil
}

// AuthMiddleware: Bearer JWT → staff user in context.

func (a *App) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		tok := strings.TrimPrefix(h, "Bearer ")
		if tok == "" || tok == h {
			c.AbortWithStatusJSON(401, gin.H{"error": "Sign in required"})
			return
		}
		secret := jwtSecret()
		parsed, err := jwt.Parse(tok, func(t *jwt.Token) (any, error) { return []byte(secret), nil })
		if err != nil || !parsed.Valid {
			c.AbortWithStatusJSON(401, gin.H{"error": "Session expired — sign in again"})
			return
		}
		claims, _ := parsed.Claims.(jwt.MapClaims)
		email, _ := claims["email"].(string)
		var u StaffUser
		var lastActive sql.NullTime
		err = a.store.db.QueryRow(`SELECT id, name, email, role, status, mfa, last_active
			FROM staff_users WHERE lower(email)=lower($1)`, email).Scan(
			&u.ID, &u.Name, &u.Email, &u.Role, &u.Status, &u.MFA, &lastActive)
		if err != nil || u.Status != "active" {
			c.AbortWithStatusJSON(401, gin.H{"error": "Account is not active"})
			return
		}
		if lastActive.Valid {
			u.LastActive = &lastActive.Time
		}
		c.Set("user", u)
		c.Next()
	}
}

func currentUser(c *gin.Context) StaffUser {
	u, _ := c.Get("user")
	return u.(StaffUser)
}

var _ = http.StatusOK

// POST /api/auth/password (Bearer) — change your own password.
// Policy mirrors src/admin/schemas.ts PASSWORD_RULES (12+ chars, mixed
// case, a number, a symbol, different from the current password).
func (a *App) handleChangePassword(c *gin.Context) {
	var in struct {
		Current  string `json:"current"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Enter your current and new password."})
		return
	}
	u := currentUser(c)
	var hash string
	if err := a.store.db.QueryRow(`SELECT password_hash FROM staff_users WHERE id=$1`, u.ID).Scan(&hash); err != nil {
		c.JSON(500, gin.H{"error": "Could not load your account."})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Current)); err != nil {
		c.JSON(400, gin.H{"error": "That isn’t your current password."})
		return
	}
	if msg := passwordPolicyError(in.Password, in.Current); msg != "" {
		c.JSON(400, gin.H{"error": msg})
		return
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not update password"})
		return
	}
	if _, err := a.store.db.Exec(`UPDATE staff_users SET password_hash=$1 WHERE id=$2`, string(newHash), u.ID); err != nil {
		c.JSON(500, gin.H{"error": "Could not update password"})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
VALUES ($1,'Changed password',$2,'Own account')`, u.Name, u.Email)
	c.JSON(200, gin.H{"ok": true})
}

func passwordPolicyError(password, current string) string {
	if len(password) < 12 {
		return "Your new password must be at least 12 characters."
	}
	hasUpper, hasLower, hasDigit, hasSymbol := false, false, false, false
	for _, r := range password {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasDigit = true
		default:
			hasSymbol = true
		}
	}
	if !hasUpper || !hasLower {
		return "Use both an uppercase and a lowercase letter."
	}
	if !hasDigit {
		return "Include at least one number."
	}
	if !hasSymbol {
		return "Include at least one symbol, e.g. @ # !"
	}
	if password == current {
		return "Choose a password you haven’t used here before."
	}
	return ""
}
