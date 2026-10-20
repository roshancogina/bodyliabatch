package main

// Admin batch operations: edit details, recall/restore, bulk import.
// PATCH  /api/admin/batches/:batch          — edit manufactured/expires/facility/lab
// POST   /api/admin/batches/:batch/recall   — { reason } → status=recalled
// DELETE /api/admin/batches/:batch/recall   — restore released
// POST   /api/admin/import/batches          — { rows: [...] } all-or-nothing
// Every mutation writes an audit_log row; recall also sets recall_reason.

import (
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// PATCH /api/admin/batches/:batch — edit release details (not status).
func (a *App) handleAdminEditBatch(c *gin.Context) {
	var in struct {
		Manufactured string `json:"manufactured"`
		Expires      string `json:"expires"`
		Facility     string `json:"facility"`
		Lab          string `json:"lab"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body."})
		return
	}
	batch := normaliseBatch(c.Param("batch"))
	rec, _, _, err := a.store.ResolveBatch(batch)
	if err != nil || rec == nil {
		c.JSON(404, gin.H{"error": "Batch not found."})
		return
	}
	mfg, err1 := time.Parse("2006-01-02", in.Manufactured)
	exp, err2 := time.Parse("2006-01-02", in.Expires)
	if err1 != nil || err2 != nil || !exp.After(mfg) {
		c.JSON(400, gin.H{"error": "Expiry date must be after the manufacture date."})
		return
	}
	if mfg.After(time.Now()) {
		c.JSON(400, gin.H{"error": "Manufacture date can’t be in the future."})
		return
	}
	if strings.TrimSpace(in.Facility) == "" || strings.TrimSpace(in.Lab) == "" {
		c.JSON(400, gin.H{"error": "Facility and lab are required."})
		return
	}
	if _, err := a.store.db.Exec(`UPDATE batches SET manufactured=$1, expires=$2,
		facility=$3, lab=$4, updated_at=NOW() WHERE batch=$5`,
		in.Manufactured, in.Expires, strings.TrimSpace(in.Facility), strings.TrimSpace(in.Lab), batch); err != nil {
		c.JSON(500, gin.H{"error": "Could not update batch."})
		return
	}
	u := currentUser(c)
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Updated batch',$2,$3)`, u.Name, batch,
		"manufactured "+in.Manufactured+", expires "+in.Expires)
	updated, _, _, _ := a.store.ResolveBatch(batch)
	c.JSON(200, updated)
}

// POST /api/admin/batches/:batch/recall — { reason } (min 20 chars).
func (a *App) handleAdminRecallBatch(c *gin.Context) {
	var in struct {
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body."})
		return
	}
	reason := strings.TrimSpace(in.Reason)
	if len(reason) < 20 {
		c.JSON(400, gin.H{"error": "Explain the recall in at least 20 characters — customers will read this."})
		return
	}
	batch := normaliseBatch(c.Param("batch"))
	res, err := a.store.db.Exec(`UPDATE batches SET status='recalled', recall_reason=$1,
		updated_at=NOW() WHERE batch=$2 AND status<>'recalled'`, reason, batch)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not recall batch."})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(409, gin.H{"error": "Batch not found or already recalled."})
		return
	}
	u := currentUser(c)
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Recalled batch',$2,$3)`, u.Name, batch, reason)
	rec, _, _, _ := a.store.ResolveBatch(batch)
	c.JSON(200, rec)
}

// DELETE /api/admin/batches/:batch/recall — restore after a mistaken recall.
func (a *App) handleAdminUnrecallBatch(c *gin.Context) {
	batch := normaliseBatch(c.Param("batch"))
	res, err := a.store.db.Exec(`UPDATE batches SET status='released', recall_reason=NULL,
		updated_at=NOW() WHERE batch=$1 AND status='recalled'`, batch)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not restore batch."})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(409, gin.H{"error": "Batch not found or not recalled."})
		return
	}
	u := currentUser(c)
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Restored batch',$2,'recall lifted')`, u.Name, batch)
	rec, _, _, _ := a.store.ResolveBatch(batch)
	c.JSON(200, rec)
}

// importRow is one CSV row already parsed by the browser (header:
// batch,product,manufactured,expires,facility,lab[,aliases]).
type importRow struct {
	Batch        string   `json:"batch"`
	Product      string   `json:"product"`
	Manufactured string   `json:"manufactured"`
	Expires      string   `json:"expires"`
	Facility     string   `json:"facility"`
	Lab          string   `json:"lab"`
	Aliases      []string `json:"aliases"`
}

// POST /api/admin/import/batches — { rows: [...] } ALL-OR-NOTHING.
// Every row is validated (canonical shape, product cross-check, dates,
// alias uniqueness within the payload and against the DB) before a single
// transaction inserts everything; the first failure rolls back the lot.
func (a *App) handleAdminImportBatches(c *gin.Context) {
	var in struct {
		Rows []importRow `json:"rows"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body."})
		return
	}
	if len(in.Rows) == 0 {
		c.JSON(400, gin.H{"error": "The import has no rows."})
		return
	}
	if len(in.Rows) > 500 {
		c.JSON(400, gin.H{"error": "At most 500 rows per import."})
		return
	}
	seenBatch := map[string]bool{}
	seenAlias := map[string]string{} // alias → owning batch (within payload)
	type pendingAlias struct{ code, kind, batch, createdBy string }
	var pending []pendingAlias
	type pendingBatch struct{ batch, product, mfg, exp, facility, lab string }
	var batches []pendingBatch

	for i, r := range in.Rows {
		row := i + 1
		batch := normaliseBatch(r.Batch)
		product := strings.ToUpper(strings.TrimSpace(r.Product))
		if !isCanonicalBatch(batch) {
			c.JSON(400, gin.H{"error": "Row " + itoa(row) + ": " + canonicalBatchError(r.Batch)})
			return
		}
		if batch[0:2] != product {
			c.JSON(400, gin.H{"error": "Row " + itoa(row) + ": product must match the two-letter code at the start of the batch number."})
			return
		}
		if seenBatch[batch] {
			c.JSON(400, gin.H{"error": "Row " + itoa(row) + ": duplicate batch " + batch + " in this import."})
			return
		}
		seenBatch[batch] = true
		mfg, err1 := time.Parse("2006-01-02", r.Manufactured)
		exp, err2 := time.Parse("2006-01-02", r.Expires)
		if err1 != nil || err2 != nil || !exp.After(mfg) {
			c.JSON(400, gin.H{"error": "Row " + itoa(row) + ": expiry date must be after the manufacture date."})
			return
		}
		if mfg.After(time.Now()) {
			c.JSON(400, gin.H{"error": "Row " + itoa(row) + ": manufacture date can’t be in the future."})
			return
		}
		if strings.TrimSpace(r.Facility) == "" || strings.TrimSpace(r.Lab) == "" {
			c.JSON(400, gin.H{"error": "Row " + itoa(row) + ": facility and lab are required."})
			return
		}
		for _, raw := range r.Aliases {
			code := normaliseAlias(raw)
			if code == "" {
				continue
			}
			if !isValidAlias(code) || code == batch {
				c.JSON(400, gin.H{"error": "Row " + itoa(row) + ": mapped code " + code + " is not a valid manufacturer or label code."})
				return
			}
			if owner, dup := seenAlias[code]; dup {
				c.JSON(400, gin.H{"error": "Row " + itoa(row) + ": mapped code " + code + " is already used by " + owner + " in this import."})
				return
			}
			if owner := aliasClashDetail(a.store, code, ""); owner != "" {
				c.JSON(409, gin.H{"error": "Row " + itoa(row) + ": \"" + code + "\" is already used by " + owner + "."})
				return
			}
			seenAlias[code] = batch
			pending = append(pending, pendingAlias{code: code, kind: "manufacturer", batch: batch, createdBy: currentUser(c).Name})
		}
		batches = append(batches, pendingBatch{batch: batch, product: product, mfg: r.Manufactured, exp: r.Expires, facility: strings.TrimSpace(r.Facility), lab: strings.TrimSpace(r.Lab)})
	}

	tx, err := a.store.db.Begin()
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not import batches."})
		return
	}
	for _, b := range batches {
		if _, err := tx.Exec(`INSERT INTO batches
			(batch, product_code, manufactured, expires, facility, lab, status)
			VALUES ($1,$2,$3,$4,$5,$6,'released')`,
			b.batch, b.product, b.mfg, b.exp, b.facility, b.lab); err != nil {
			_ = tx.Rollback()
			if isDupErr(err) {
				c.JSON(409, gin.H{"error": "Batch " + b.batch + " is already registered."})
				return
			}
			c.JSON(500, gin.H{"error": "Could not import batches."})
			return
		}
	}
	for _, al := range pending {
		if _, err := tx.Exec(`INSERT INTO batch_aliases (alias, compact_key, batch, kind, created_by)
			VALUES ($1,$2,$3,$4,$5)`, al.code, compactKey(al.code), al.batch, al.kind, al.createdBy); err != nil {
			_ = tx.Rollback()
			if isDupErr(err) {
				c.JSON(409, gin.H{"error": "Mapped code \"" + al.code + "\" is already used."})
				return
			}
			c.JSON(500, gin.H{"error": "Could not save mapped codes."})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Could not import batches."})
		return
	}
	u := currentUser(c)
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Bulk imported batches',$2,$3)`, u.Name, itoa(len(batches)),
		"aliases: "+itoa(len(pending)))
	c.JSON(201, gin.H{"imported": len(batches), "aliases": len(pending)})
}
