package main

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// POST /api/auth/login → { token, user }

func (a *App) handleLogin(c *gin.Context) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Enter your work email and password."})
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
