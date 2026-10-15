package main

import (
	"database/sql"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// GET /api/admin/me
func (a *App) handleMe(c *gin.Context) {
	c.JSON(200, currentUser(c))
}

// GET /api/admin/batches?q= (alias-aware search)
func (a *App) handleAdminListBatches(c *gin.Context) {
	q := c.Query("q")
	recs, err := a.store.SearchBatches(q)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not search batches"})
		return
	}
	if recs == nil {
		recs = []*BatchRecord{}
	}
	c.JSON(200, recs)
}

// GET /api/admin/batches/:batch
func (a *App) handleAdminGetBatch(c *gin.Context) {
	rec, _, err := a.store.ResolveBatch(c.Param("batch"))
	if err != nil || rec == nil {
		c.JSON(404, gin.H{"error": "Batch not found"})
		return
	}
	c.JSON(200, rec)
}

// POST /api/admin/batches — register canonical + optional aliases
func (a *App) handleAdminRegisterBatch(c *gin.Context) {
	var in struct {
		Batch        string   `json:"batch"`
		Product      string   `json:"product"`
		Manufactured string   `json:"manufactured"`
		Expires      string   `json:"expires"`
		Facility     string   `json:"facility"`
		Lab          string   `json:"lab"`
		Aliases      []string `json:"aliases"`
		Coa          []CoaRow `json:"coa"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body"})
		return
	}
	u := currentUser(c)
	batch := normaliseBatch(in.Batch)
	product := strings.ToUpper(strings.TrimSpace(in.Product))
	if !isCanonicalBatch(batch) {
		c.JSON(400, gin.H{"error": "Batch numbers look like BDL-FR-2509-0312."})
		return
	}
	if batch[4:6] != product {
		c.JSON(400, gin.H{"error": "Product must match the two-letter code in the batch number."})
		return
	}
	mfg, err1 := time.Parse("2006-01-02", in.Manufactured)
	exp, err2 := time.Parse("2006-01-02", in.Expires)
	if err1 != nil || err2 != nil || !exp.After(mfg) {
		c.JSON(400, gin.H{"error": "Expiry date must be after the manufacture date."})
		return
	}
	if len(in.Coa) == 0 {
		c.JSON(400, gin.H{"error": "Add at least one lab test result."})
		return
	}
	// Normalise + validate aliases
	norms := []string{}
	seen := map[string]bool{}
	for _, raw := range in.Aliases {
		n := normaliseAlias(raw)
		if n == "" {
			continue
		}
		if !isValidAlias(n) || n == batch {
			c.JSON(400, gin.H{"error": "Alias " + n + " is not a valid vendor code."})
			return
		}
		if seen[n] {
			c.JSON(400, gin.H{"error": "Remove duplicate aliases."})
			return
		}
		seen[n] = true
		if owner := aliasClashDetail(a.store, n, ""); owner != "" {
			c.JSON(409, gin.H{"error": "\"" + n + "\" is already used by " + owner + "."})
			return
		}
		norms = append(norms, n)
	}
	if len(norms) > 20 {
		c.JSON(400, gin.H{"error": "At most 20 aliases per batch."})
		return
	}
	tx, err := a.store.db.Begin()
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not register batch"})
		return
	}
	_, err = tx.Exec(`INSERT INTO batches
		(batch, product_code, manufactured, expires, facility, lab, status)
		VALUES ($1,$2,$3,$4,$5,$6,'released')`,
		batch, product, in.Manufactured, in.Expires, in.Facility, in.Lab)
	if err != nil {
		tx.Rollback()
		if isDupErr(err) {
			c.JSON(409, gin.H{"error": "This batch number is already registered."})
			return
		}
		c.JSON(500, gin.H{"error": "Could not register batch"})
		return
	}
	for i, cr := range in.Coa {
		if _, err := tx.Exec(`INSERT INTO coa_rows (batch, test, specification, result, pass, position)
			VALUES ($1,$2,$3,$4,$5,$6)`, batch, cr.Test, cr.Specification, cr.Result, cr.Pass, i); err != nil {
			tx.Rollback()
			c.JSON(500, gin.H{"error": "Could not save lab results"})
			return
		}
	}
	for _, al := range norms {
		if _, err := tx.Exec(`INSERT INTO batch_aliases (alias, compact_key, batch, created_by)
			VALUES ($1,$2,$3,$4)`, al, compactKey(al), batch, u.Name); err != nil {
			tx.Rollback()
			if isDupErr(err) {
				c.JSON(409, gin.H{"error": "Alias \"" + al + "\" is already used."})
				return
			}
			c.JSON(500, gin.H{"error": "Could not save aliases"})
			return
		}
	}
	detail := ""
	if len(norms) > 0 {
		detail = "aliases: " + strings.Join(norms, ", ")
	}
	_, _ = tx.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Registered batch',$2,$3)`, u.Name, batch, sql.NullString{String: detail, Valid: detail != ""})
	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Could not register batch"})
		return
	}
	rec, _, _ := a.store.ResolveBatch(batch)
	c.JSON(201, rec)
}
