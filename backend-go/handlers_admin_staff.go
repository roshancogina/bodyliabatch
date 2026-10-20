package main

import (
	"database/sql"
	"log"
	"math/rand"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// StaffUserOut mirrors the frontend StaffUser contract (no password hash).
type StaffUserOut struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Email      string     `json:"email"`
	Role       string     `json:"role"`
	Status     string     `json:"status"`
	MFA        bool       `json:"mfa"`
	LastActive *time.Time `json:"lastActive,omitempty"`
}

// StaffCreateInput is the body for POST /api/admin/staff.
type StaffCreateInput struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// StaffUpdateInput is the body for PATCH /api/admin/staff/:id.
type StaffUpdateInput struct {
	Role   *string `json:"role"`
	Status *string `json:"status"`
}

var validRoles = map[string]bool{"admin": true, "quality": true, "support": true}
var validStatuses = map[string]bool{"active": true, "invited": true, "deactivated": true}

// GET /api/admin/staff — list staff users (requires users.manage).
func (a *App) handleAdminListStaff(c *gin.Context) {
	u := currentUser(c)
	if !canManageUsers(u) {
		c.JSON(403, gin.H{"error": "You cannot manage staff accounts."})
		return
	}
	rows, err := a.store.db.Query(`SELECT id, name, email, role, status, mfa, last_active
		FROM staff_users ORDER BY name`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load staff."})
		return
	}
	defer rows.Close()
	out := []StaffUserOut{}
	for rows.Next() {
		var s StaffUserOut
		var la sql.NullTime
		if err := rows.Scan(&s.ID, &s.Name, &s.Email, &s.Role, &s.Status, &s.MFA, &la); err != nil {
			c.JSON(500, gin.H{"error": "Could not read staff row."})
			return
		}
		if la.Valid {
			s.LastActive = &la.Time
		}
		out = append(out, s)
	}
	c.JSON(200, out)
}

// POST /api/admin/staff — create / invite a staff member (requires users.manage).
func (a *App) handleAdminCreateStaff(c *gin.Context) {
	u := currentUser(c)
	if !canManageUsers(u) {
		c.JSON(403, gin.H{"error": "You cannot manage staff accounts."})
		return
	}
	var in StaffCreateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Enter name, email and role."})
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if in.Name == "" || in.Email == "" || !validRoles[in.Role] {
		c.JSON(400, gin.H{"error": "Enter name, email and a valid role."})
		return
	}
	// Temp password: 16 random chars, bcrypt-hashed. Returned once to the inviter.
	tmpPwd := randomPassword(16)
	hash, err := bcrypt.GenerateFromPassword([]byte(tmpPwd), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not create account."})
		return
	}
	var id string
	err = a.store.db.QueryRow(`INSERT INTO staff_users (name, email, password_hash, role, status, mfa)
		VALUES ($1, lower($2), $3, $4, 'invited', FALSE)
		RETURNING id`, in.Name, in.Email, string(hash), in.Role).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			c.JSON(409, gin.H{"error": "An account with this email already exists."})
			return
		}
		c.JSON(500, gin.H{"error": "Could not create account."})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Invited staff',$2,'Role: '+$3)`, u.Name, in.Email, in.Role)
	// Log the one-time password so the inviter can deliver it (no SMTP in this deploy).
	log.Printf("staff-invite: %s (%s, role=%s) temporary password: %s", in.Name, in.Email, in.Role, tmpPwd)
	c.JSON(200, gin.H{
		"id":                id,
		"name":              in.Name,
		"email":             in.Email,
		"role":              in.Role,
		"status":            "invited",
		"temporaryPassword": tmpPwd,
	})
}

// PATCH /api/admin/staff/:id — update role / status (requires users.manage).
func (a *App) handleAdminUpdateStaff(c *gin.Context) {
	u := currentUser(c)
	if !canManageUsers(u) {
		c.JSON(403, gin.H{"error": "You cannot manage staff accounts."})
		return
	}
	id := c.Param("id")
	var in StaffUpdateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Send role and/or status to update."})
		return
	}
	// Prevent self-deactivation.
	var me string
	a.store.db.QueryRow(`SELECT id FROM staff_users WHERE lower(email)=lower($1)`, u.Email).Scan(&me)
	if in.Status != nil && *in.Status == "deactivated" && id == me {
		c.JSON(400, gin.H{"error": "You cannot deactivate your own account."})
		return
	}
	fields := []string{}
	args := []any{}
	argN := 1
	if in.Role != nil {
		if !validRoles[*in.Role] {
			c.JSON(400, gin.H{"error": "Invalid role."})
			return
		}
		fields = append(fields, `role=$`+string(rune('0'+argN)))
		args = append(args, *in.Role)
		argN++
	}
	if in.Status != nil {
		if !validStatuses[*in.Status] {
			c.JSON(400, gin.H{"error": "Invalid status."})
			return
		}
		fields = append(fields, `status=$`+string(rune('0'+argN)))
		args = append(args, *in.Status)
		argN++
	}
	if len(fields) == 0 {
		c.JSON(400, gin.H{"error": "Nothing to update."})
		return
	}
	args = append(args, id)
	q := `UPDATE staff_users SET ` + strings.Join(fields, ", ") + ` WHERE id=$` + string(rune('0'+argN))
	if res, err := a.store.db.Exec(q, args...); err != nil {
		c.JSON(500, gin.H{"error": "Could not update staff."})
		return
	} else if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(404, gin.H{"error": "Staff member not found."})
		return
	}
	detail := []string{}
	if in.Role != nil {
		detail = append(detail, "role="+*in.Role)
	}
	if in.Status != nil {
		detail = append(detail, "status="+*in.Status)
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Updated staff',$2,$3)`, u.Name, id, strings.Join(detail, "; "))
	c.JSON(200, gin.H{"ok": true})
}

// DELETE /api/admin/staff/:id — deactivate a staff account (requires users.manage).
func (a *App) handleAdminDeactivateStaff(c *gin.Context) {
	u := currentUser(c)
	if !canManageUsers(u) {
		c.JSON(403, gin.H{"error": "You cannot manage staff accounts."})
		return
	}
	id := c.Param("id")
	var me, name string
	a.store.db.QueryRow(`SELECT id, name FROM staff_users WHERE lower(email)=lower($1)`, u.Email).Scan(&me, &name)
	if id == me {
		c.JSON(400, gin.H{"error": "You cannot deactivate your own account."})
		return
	}
	var targetName string
	if err := a.store.db.QueryRow(`SELECT name FROM staff_users WHERE id=$1`, id).Scan(&targetName); err != nil {
		c.JSON(404, gin.H{"error": "Staff member not found."})
		return
	}
	if _, err := a.store.db.Exec(`UPDATE staff_users SET status='deactivated' WHERE id=$1`, id); err != nil {
		c.JSON(500, gin.H{"error": "Could not deactivate account."})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Deactivated staff',$2,'Account: '+$3)`, u.Name, id, targetName)
	c.JSON(200, gin.H{"ok": true})
}

func canManageUsers(u any) bool {
	user, ok := u.(StaffUser)
	if !ok {
		return false
	}
	return user.Role == "admin"
}

func randomPassword(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		b = []byte(strings.Repeat("x", n))
	}
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
	out := make([]byte, n)
	for i := range b {
		out[i] = chars[int(b[i])%len(chars)]
	}
	return string(out)
}
