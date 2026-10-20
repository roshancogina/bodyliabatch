package main

// Admin console misc: audit log, settings, catalogue CRUD.
// GET    /api/admin/audit                    — audit events (?target= & ?limit=)
// GET    /api/admin/settings                 — singleton settings row
// PATCH  /api/admin/settings                 — edit (admin only)
// GET    /api/admin/catalogue                — products + sites
// POST   /api/admin/catalogue/products       — create (admin only, audited)
// PATCH  /api/admin/catalogue/products/:code — { archived } or field edits
// DELETE /api/admin/catalogue/products/:code — hard delete (409 if referenced)
// POST   /api/admin/catalogue/sites          — create (admin only, audited)
// PATCH  /api/admin/catalogue/sites/:id      — { archived } or field edits
// DELETE /api/admin/catalogue/sites/:id      — hard delete (admin only)

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

// PATCH /api/admin/catalogue/products/:code — admin only.
// { archived } toggles the soft-delete flag; name / claim / format /
// shelfLifeMonths / image edit the product. Everything is audited.
func (a *App) handleAdminUpdateProduct(c *gin.Context) {
	if !canManageUsers(currentUser(c)) {
		c.JSON(403, gin.H{"error": "Only admins can change the catalogue."})
		return
	}
	var in struct {
		Archived        *bool   `json:"archived"`
		Name            *string `json:"name"`
		Claim           *string `json:"claim"`
		Format          *string `json:"format"`
		ShelfLifeMonths *int    `json:"shelfLifeMonths"`
		Image           *string `json:"image"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body."})
		return
	}
	if in.Archived == nil && in.Name == nil && in.Claim == nil &&
		in.Format == nil && in.ShelfLifeMonths == nil && in.Image == nil {
		c.JSON(400, gin.H{"error": "Send { archived } or product fields to update."})
		return
	}
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))
	if in.Archived != nil {
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
		return
	}
	// Field edit — validate each provided field (mirrors productSchema).
	sets := []string{}
	args := []any{}
	changed := []string{}
	addText := func(col string, v *string, min, max int, label string) bool {
		val := strings.TrimSpace(*v)
		if len(val) < min || len(val) > max {
			c.JSON(400, gin.H{"error": label + " must be " + itoa(min) + "–" + itoa(max) + " characters."})
			return false
		}
		args = append(args, val)
		sets = append(sets, col+"=$"+itoa(len(args)))
		changed = append(changed, label)
		return true
	}
	if in.Name != nil && !addText("name", in.Name, 2, 40, "name") {
		return
	}
	if in.Claim != nil && !addText("claim", in.Claim, 10, 120, "claim") {
		return
	}
	if in.Format != nil && !addText("format", in.Format, 3, 120, "format") {
		return
	}
	if in.ShelfLifeMonths != nil {
		if *in.ShelfLifeMonths < 6 || *in.ShelfLifeMonths > 60 {
			c.JSON(400, gin.H{"error": "Shelf life must be between 6 and 60 months."})
			return
		}
		args = append(args, *in.ShelfLifeMonths)
		sets = append(sets, "shelf_life_months=$"+itoa(len(args)))
		changed = append(changed, "shelf life")
	}
	if in.Image != nil {
		img := strings.TrimSpace(*in.Image)
		if !strings.HasPrefix(img, "https://") || len(img) > 500 {
			c.JSON(400, gin.H{"error": "Image must be a full https:// URL (max 500 characters)."})
			return
		}
		args = append(args, img)
		sets = append(sets, "image_url=$"+itoa(len(args)))
		changed = append(changed, "image")
	}
	args = append(args, code)
	res, err := a.store.db.Exec(`UPDATE products SET `+strings.Join(sets, ", ")+`, updated_at=NOW() WHERE code=$`+itoa(len(args)), args...)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not update product."})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(404, gin.H{"error": "Product not found."})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Updated product',$2,$3)`, currentUser(c).Name, code,
		"fields: "+strings.Join(changed, ", "))
	c.JSON(200, gin.H{"code": code, "updated": true})
}

// PATCH /api/admin/catalogue/sites/:id — admin only.
// { archived } toggles the soft-delete flag; name / accreditation /
// accreditationExpires edit the site. Everything is audited.
func (a *App) handleAdminUpdateSite(c *gin.Context) {
	if !canManageUsers(currentUser(c)) {
		c.JSON(403, gin.H{"error": "Only admins can change the catalogue."})
		return
	}
	var in struct {
		Archived             *bool   `json:"archived"`
		Name                 *string `json:"name"`
		Accreditation        *string `json:"accreditation"`
		AccreditationExpires *string `json:"accreditationExpires"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body."})
		return
	}
	if in.Archived == nil && in.Name == nil && in.Accreditation == nil && in.AccreditationExpires == nil {
		c.JSON(400, gin.H{"error": "Send { archived } or site fields to update."})
		return
	}
	id := strings.TrimSpace(c.Param("id"))
	if in.Archived != nil {
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
		return
	}
	// Field edit — validate each provided field (mirrors siteSchema).
	sets := []string{}
	args := []any{}
	changed := []string{}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if len(name) < 5 || len(name) > 200 {
			c.JSON(400, gin.H{"error": "Site name must be 5–200 characters."})
			return
		}
		args = append(args, name)
		sets = append(sets, "name=$"+itoa(len(args)))
		changed = append(changed, "name")
	}
	if in.Accreditation != nil {
		ac := strings.TrimSpace(*in.Accreditation)
		if len(ac) < 3 || len(ac) > 100 {
			c.JSON(400, gin.H{"error": "Accreditation must be 3–100 characters."})
			return
		}
		args = append(args, ac)
		sets = append(sets, "accreditation=$"+itoa(len(args)))
		changed = append(changed, "accreditation")
	}
	if in.AccreditationExpires != nil {
		d, err := time.Parse("2006-01-02", strings.TrimSpace(*in.AccreditationExpires))
		if err != nil {
			c.JSON(400, gin.H{"error": "Accreditation expiry must be a YYYY-MM-DD date."})
			return
		}
		y, m, dd := time.Now().Date()
		today := time.Date(y, m, dd, 0, 0, 0, 0, time.UTC)
		if !d.After(today) {
			c.JSON(400, gin.H{"error": "Accreditation has already expired — it can’t be set."})
			return
		}
		args = append(args, d.Format("2006-01-02"))
		sets = append(sets, "accreditation_expires=$"+itoa(len(args)))
		changed = append(changed, "accreditation expiry")
	}
	args = append(args, id)
	res, err := a.store.db.Exec(`UPDATE sites SET `+strings.Join(sets, ", ")+`, updated_at=NOW() WHERE id=$`+itoa(len(args)), args...)
	if err != nil {
		if isDupErr(err) {
			c.JSON(409, gin.H{"error": "Another site already uses that name."})
			return
		}
		c.JSON(500, gin.H{"error": "Could not update site."})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(404, gin.H{"error": "Site not found."})
		return
	}
	var name string
	_ = a.store.db.QueryRow(`SELECT name FROM sites WHERE id=$1`, id).Scan(&name)
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Updated site',$2,$3)`, currentUser(c).Name, name,
		"fields: "+strings.Join(changed, ", "))
	c.JSON(200, gin.H{"id": id, "updated": true})
}

// POST /api/admin/catalogue/products — create (admin only, audited).
// Validation mirrors productSchema (src/admin/schemas.ts).
func (a *App) handleAdminCreateProduct(c *gin.Context) {
	if !canManageUsers(currentUser(c)) {
		c.JSON(403, gin.H{"error": "Only admins can change the catalogue."})
		return
	}
	var in struct {
		Code            string `json:"code"`
		Name            string `json:"name"`
		Claim           string `json:"claim"`
		Format          string `json:"format"`
		ShelfLifeMonths int    `json:"shelfLifeMonths"`
		Image           string `json:"image"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body."})
		return
	}
	code := strings.ToUpper(strings.TrimSpace(in.Code))
	if len(code) != 2 || code[0] < 'A' || code[0] > 'Z' || code[1] < 'A' || code[1] > 'Z' {
		c.JSON(400, gin.H{"error": "Code must be exactly 2 letters."})
		return
	}
	name := strings.TrimSpace(in.Name)
	if len(name) < 2 || len(name) > 40 {
		c.JSON(400, gin.H{"error": "Product name must be 2–40 characters."})
		return
	}
	claim := strings.TrimSpace(in.Claim)
	if len(claim) < 10 || len(claim) > 120 {
		c.JSON(400, gin.H{"error": "Claim must be 10–120 characters."})
		return
	}
	format := strings.TrimSpace(in.Format)
	if len(format) < 3 || len(format) > 120 {
		c.JSON(400, gin.H{"error": "Pack format must be 3–120 characters."})
		return
	}
	if in.ShelfLifeMonths < 6 || in.ShelfLifeMonths > 60 {
		c.JSON(400, gin.H{"error": "Shelf life must be between 6 and 60 months."})
		return
	}
	img := strings.TrimSpace(in.Image)
	if !strings.HasPrefix(img, "https://") || len(img) > 500 {
		c.JSON(400, gin.H{"error": "Image must be a full https:// URL (max 500 characters)."})
		return
	}
	_, err := a.store.db.Exec(`INSERT INTO products
		(code, name, claim, format, image_url, shelf_life_months)
		VALUES ($1,$2,$3,$4,$5,$6)`, code, name, claim, format, img, in.ShelfLifeMonths)
	if err != nil {
		if isDupErr(err) {
			c.JSON(409, gin.H{"error": "Product " + code + " already exists."})
			return
		}
		c.JSON(500, gin.H{"error": "Could not create product."})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Created product',$2,$3)`, currentUser(c).Name, code, name)
	c.JSON(201, gin.H{"code": code, "name": name})
}

// DELETE /api/admin/catalogue/products/:code — hard delete (admin only).
// Batches reference products by code, so referenced products refuse deletion
// (409) and should be archived instead.
func (a *App) handleAdminDeleteProduct(c *gin.Context) {
	if !canManageUsers(currentUser(c)) {
		c.JSON(403, gin.H{"error": "Only admins can change the catalogue."})
		return
	}
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))
	var name string
	if err := a.store.db.QueryRow(`SELECT name FROM products WHERE code=$1`, code).Scan(&name); err != nil {
		c.JSON(404, gin.H{"error": "Product not found."})
		return
	}
	var refs int
	_ = a.store.db.QueryRow(`SELECT COUNT(*) FROM batches WHERE product_code=$1`, code).Scan(&refs)
	if refs > 0 {
		c.JSON(409, gin.H{"error": itoa(refs) + " registered batches use product " + code + " — archive it instead of deleting."})
		return
	}
	if _, err := a.store.db.Exec(`DELETE FROM products WHERE code=$1`, code); err != nil {
		c.JSON(500, gin.H{"error": "Could not delete product."})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Deleted product',$2,$3)`, currentUser(c).Name, code, name)
	c.JSON(200, gin.H{"code": code, "deleted": true})
}

// POST /api/admin/catalogue/sites — create a facility or lab (admin only).
// Validation mirrors siteSchema (src/admin/schemas.ts).
func (a *App) handleAdminCreateSite(c *gin.Context) {
	if !canManageUsers(currentUser(c)) {
		c.JSON(403, gin.H{"error": "Only admins can change the catalogue."})
		return
	}
	var in struct {
		Kind                 string `json:"kind"`
		Name                 string `json:"name"`
		Accreditation        string `json:"accreditation"`
		AccreditationExpires string `json:"accreditationExpires"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body."})
		return
	}
	kind := strings.TrimSpace(in.Kind)
	if kind != "facility" && kind != "lab" {
		c.JSON(400, gin.H{"error": "Site kind must be facility or lab."})
		return
	}
	name := strings.TrimSpace(in.Name)
	if len(name) < 5 || len(name) > 200 {
		c.JSON(400, gin.H{"error": "Site name must be 5–200 characters."})
		return
	}
	ac := strings.TrimSpace(in.Accreditation)
	if len(ac) < 3 || len(ac) > 100 {
		c.JSON(400, gin.H{"error": "Accreditation must be 3–100 characters."})
		return
	}
	d, err := time.Parse("2006-01-02", strings.TrimSpace(in.AccreditationExpires))
	if err != nil {
		c.JSON(400, gin.H{"error": "Accreditation expiry must be a YYYY-MM-DD date."})
		return
	}
	y, m, dd := time.Now().Date()
	today := time.Date(y, m, dd, 0, 0, 0, 0, time.UTC)
	if !d.After(today) {
		c.JSON(400, gin.H{"error": "Accreditation has already expired — it can’t be added."})
		return
	}
	var id string
	if err := a.store.db.QueryRow(`INSERT INTO sites (kind, name, accreditation, accreditation_expires)
		VALUES ($1,$2,$3,$4) RETURNING id`, kind, name, ac, d.Format("2006-01-02")).Scan(&id); err != nil {
		if isDupErr(err) {
			c.JSON(409, gin.H{"error": "A site named “" + name + "” already exists."})
			return
		}
		c.JSON(500, gin.H{"error": "Could not create site."})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Created site',$2,$3)`, currentUser(c).Name, name, kind)
	c.JSON(201, gin.H{"id": id, "kind": kind, "name": name})
}

// DELETE /api/admin/catalogue/sites/:id — hard delete (admin only, audited).
// Batches store facility/lab as free text, so no batch references block this.
func (a *App) handleAdminDeleteSite(c *gin.Context) {
	if !canManageUsers(currentUser(c)) {
		c.JSON(403, gin.H{"error": "Only admins can change the catalogue."})
		return
	}
	id := strings.TrimSpace(c.Param("id"))
	var name string
	if err := a.store.db.QueryRow(`SELECT name FROM sites WHERE id=$1`, id).Scan(&name); err != nil {
		c.JSON(404, gin.H{"error": "Site not found."})
		return
	}
	if _, err := a.store.db.Exec(`DELETE FROM sites WHERE id=$1`, id); err != nil {
		c.JSON(500, gin.H{"error": "Could not delete site."})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Deleted site',$2,NULL)`, currentUser(c).Name, name)
	c.JSON(200, gin.H{"id": id, "deleted": true})
}
