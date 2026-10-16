package main

import (
	"database/sql"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// POST /api/auth/login → { token, user }
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
	claims := jwt.MapClaims{
		"sub": u.ID, "email": u.Email, "role": u.Role, "name": u.Name,
		"exp": time.Now().Add(15 * time.Minute).Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	_, _ = a.store.db.Exec(`UPDATE staff_users SET last_active=NOW() WHERE id=$1`, u.ID)
	c.JSON(200, gin.H{"token": signed, "user": u})
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
