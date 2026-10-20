package main

// Admin console misc: audit log, settings, catalogue.
// GET   /api/admin/audit                     — audit events (?target= & ?limit=)
// GET   /api/admin/settings                  — singleton settings row
// PATCH /api/admin/settings                  — edit (admin only)
// GET   /api/admin/catalogue                 — products + sites
// PATCH /api/admin/catalogue/products/:code  — { archived }
// PATCH /api/admin/catalogue/sites/:id       — { archived }

import (
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type AuditEvent struct {
	At     time.Time `json:"at"`
	Actor  string    `json:"actor"`
	Action string    `json:"action"`
	Target string    `json:"target"`
	Detail *string   `json:"detail,omitempty"`
}

// GET /api/admin/audit
func (a *App) handleAdminAudit(c *gin.Context) {
	target := strings.TrimSpace(c.Query("target"))
	limit := 200
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		if n, err := parsePositiveInt(raw); err == nil && n <= 1000 {
			limit = n
		}
	}
	query := `SELECT at, actor, action, target, detail FROM audit_log`
	args := []any{}
	if target != "" {
		query += " WHERE target ILIKE $1"
		args = append(args, "%"+target+"%")
	}
	query += " ORDER BY at DESC LIMIT $" + itoa(len(args)+1)
	args = append(args, limit)
	rows, err := a.store.db.Query(query, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load audit events."})
		return
	}
	defer rows.Close()
	out := []AuditEvent{}
	for rows.Next() {
		var e AuditEvent
		var detail sql.NullString
		if err := rows.Scan(&e.At, &e.Actor, &e.Action, &e.Target, &detail); err != nil {
			c.JSON(500, gin.H{"error": "Could not read audit row."})
			return
		}
		if detail.Valid {
			e.Detail = &detail.String
		}
		out = append(out, e)
	}
	c.JSON(200, out)
}

func parsePositiveInt(raw string) (int, error) {
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return 0, errNotNumber
	}
	return n, nil
}

var errNotNumber = errors.New("not a positive number")

type SettingsOut struct {
	RateLimitPerMinute int    `json:"rateLimitPerMinute"`
	ReplyTargetHours   int    `json:"replyTargetHours"`
	SupportEmail       string `json:"supportEmail"`
	RetentionMonths    int    `json:"retentionMonths"`
	SessionMinutes     int    `json:"sessionMinutes"`
	UpdatedAt          string `json:"updatedAt"`
}

// GET /api/admin/settings
func (a *App) handleAdminGetSettings(c *gin.Context) {
	var s SettingsOut
	var updated time.Time
	err := a.store.db.QueryRow(`SELECT rate_limit_per_minute, reply_target_hours,
		support_email, retention_months, session_minutes, updated_at
		FROM settings WHERE id=1`).Scan(
		&s.RateLimitPerMinute, &s.ReplyTargetHours, &s.SupportEmail,
		&s.RetentionMonths, &s.SessionMinutes, &updated)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load settings."})
		return
	}
	s.UpdatedAt = updated.UTC().Format(time.RFC3339)
	c.JSON(200, s)
}

// PATCH /api/admin/settings — admin only; any subset of fields.
func (a *App) handleAdminUpdateSettings(c *gin.Context) {
	if !canManageUsers(currentUser(c)) {
		c.JSON(403, gin.H{"error": "Only admins can change console settings."})
		return
	}
	var in struct {
		RateLimitPerMinute *int    `json:"rateLimitPerMinute"`
		ReplyTargetHours   *int    `json:"replyTargetHours"`
		SupportEmail       *string `json:"supportEmail"`
		RetentionMonths    *int    `json:"retentionMonths"`
		SessionMinutes     *int    `json:"sessionMinutes"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body."})
		return
	}
	sets := []string{}
	args := []any{}
	addInt := func(col string, v *int, min, max int) bool {
		if v == nil {
			return true
		}
		if *v < min || *v > max {
			c.JSON(400, gin.H{"error": col + " must be between " + itoa(min) + " and " + itoa(max) + "."})
			return false
		}
		args = append(args, *v)
		sets = append(sets, col+"=$"+itoa(len(args)))
		return true
	}
	if !addInt("rate_limit_per_minute", in.RateLimitPerMinute, 1, 1000) {
		return
	}
	if !addInt("reply_target_hours", in.ReplyTargetHours, 1, 720) {
		return
	}
	if !addInt("retention_months", in.RetentionMonths, 1, 120) {
		return
	}
	if !addInt("session_minutes", in.SessionMinutes, 5, 480) {
		return
	}
	if in.SupportEmail != nil {
		email := strings.TrimSpace(*in.SupportEmail)
		if !strings.Contains(email, "@") || len(email) > 120 {
			c.JSON(400, gin.H{"error": "Enter a valid support email."})
			return
		}
		args = append(args, email)
		sets = append(sets, "support_email=$"+itoa(len(args)))
	}
	if len(sets) == 0 {
		c.JSON(400, gin.H{"error": "Send at least one setting to change."})
		return
	}
	args = append(args, time.Now().UTC().Format(time.RFC3339))
	query := `UPDATE settings SET ` + strings.Join(sets, ", ") + `, updated_at=$` + itoa(len(args)) + ` WHERE id=1`
	if _, err := a.store.db.Exec(query, args...); err != nil {
		c.JSON(500, gin.H{"error": "Could not update settings."})
		return
	}
	u := currentUser(c)
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Updated settings','console',NULL)`, u.Name)
	a.handleAdminGetSettings(c)
}

type CatalogueProduct struct {
	Code            string `json:"code"`
	Name            string `json:"name"`
	Claim           string `json:"claim"`
	Format          string `json:"format"`
	ImageURL        string `json:"image"`
	ShelfLifeMonths int    `json:"shelfLifeMonths"`
	Archived        bool   `json:"archived"`
}

type CatalogueSite struct {
	ID                   string `json:"id"`
	Kind                 string `json:"kind"`
	Name                 string `json:"name"`
	Accreditation        string `json:"accreditation"`
	AccreditationExpires string `json:"accreditationExpires"`
	Archived             bool   `json:"archived"`
}

// GET /api/admin/catalogue — products + facilities/labs.
func (a *App) handleAdminCatalogue(c *gin.Context) {
	prows, err := a.store.db.Query(`SELECT code, name, claim, format, image_url,
		shelf_life_months, archived FROM products ORDER BY archived, name`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load products."})
		return
	}
	defer prows.Close()
	products := []CatalogueProduct{}
	for prows.Next() {
		var p CatalogueProduct
		if err := prows.Scan(&p.Code, &p.Name, &p.Claim, &p.Format, &p.ImageURL,
			&p.ShelfLifeMonths, &p.Archived); err != nil {
			c.JSON(500, gin.H{"error": "Could not read product row."})
			return
		}
		products = append(products, p)
	}
	srows, err := a.store.db.Query(`SELECT id, kind, name, accreditation,
		to_char(accreditation_expires, 'YYYY-MM-DD'), archived FROM sites
		ORDER BY kind, archived, name`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load sites."})
		return
	}
	defer srows.Close()
	sites := []CatalogueSite{}
	for srows.Next() {
		var s CatalogueSite
		if err := srows.Scan(&s.ID, &s.Kind, &s.Name, &s.Accreditation,
			&s.AccreditationExpires, &s.Archived); err != nil {
			c.JSON(500, gin.H{"error": "Could not read site row."})
			return
		}
		sites = append(sites, s)
	}
	c.JSON(200, gin.H{"products": products, "sites": sites})
}

// PATCH /api/admin/catalogue/products/:code — { archived } (admin only).
func (a *App) handleAdminArchiveProduct(c *gin.Context) {
	if !canManageUsers(currentUser(c)) {
		c.JSON(403, gin.H{"error": "Only admins can change the catalogue."})
		return
	}
	var in struct {
		Archived *bool `json:"archived"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.Archived == nil {
		c.JSON(400, gin.H{"error": "Send { archived: true|false }."})
		return
	}
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))
	res, err := a.store.db.Exec(`UPDATE products SET archived=$1, updated_at=NOW() WHERE code=$2`,
		*in.Archived, code)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not update product."})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(404, gin.H{"error": "Product not found."})
		return
	}
	action := "Archived product"
	if !*in.Archived {
		action = "Unarchived product"
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,$2,$3,NULL)`, currentUser(c).Name, action, code)
	c.JSON(200, gin.H{"code": code, "archived": *in.Archived})
}

// PATCH /api/admin/catalogue/sites/:id — { archived } (admin only).
func (a *App) handleAdminArchiveSite(c *gin.Context) {
	if !canManageUsers(currentUser(c)) {
		c.JSON(403, gin.H{"error": "Only admins can change the catalogue."})
		return
	}
	var in struct {
		Archived *bool `json:"archived"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.Archived == nil {
		c.JSON(400, gin.H{"error": "Send { archived: true|false }."})
		return
	}
	id := strings.TrimSpace(c.Param("id"))
	res, err := a.store.db.Exec(`UPDATE sites SET archived=$1, updated_at=NOW() WHERE id=$2`,
		*in.Archived, id)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not update site."})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(404, gin.H{"error": "Site not found."})
		return
	}
	action := "Archived site"
	if !*in.Archived {
		action = "Unarchived site"
	}
	var name string
	_ = a.store.db.QueryRow(`SELECT name FROM sites WHERE id=$1`, id).Scan(&name)
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,$2,$3,NULL)`, currentUser(c).Name, action, name)
	c.JSON(200, gin.H{"id": id, "archived": *in.Archived})
}
