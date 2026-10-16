package main

import (
	"github.com/gin-gonic/gin"
)

// Alias management: POST /api/admin/batches/:batch/aliases, DELETE .../:alias

func (a *App) handleAddAlias(c *gin.Context) {
	u := currentUser(c)
	canonical := normaliseBatch(c.Param("batch"))
	rec, _, _, err := a.store.ResolveBatch(canonical)
	if err != nil || rec == nil {
		c.JSON(404, gin.H{"error": "Batch not found"})
		return
	}
	var in struct {
		Alias string `json:"alias"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Enter a vendor code."})
		return
	}
	n := normaliseAlias(in.Alias)
	if !isValidAlias(n) || n == rec.Batch {
		c.JSON(400, gin.H{"error": "That is not a valid vendor alias."})
		return
	}
	if owner := aliasClashDetail(a.store, n, rec.Batch); owner != "" {
		c.JSON(409, gin.H{"error": "\"" + n + "\" is already used by " + owner + "."})
		return
	}
	if len(rec.Aliases) >= 20 {
		c.JSON(400, gin.H{"error": "At most 20 aliases per batch."})
		return
	}
	if _, err := a.store.db.Exec(`INSERT INTO batch_aliases (alias, compact_key, batch, created_by)
		VALUES ($1,$2,$3,$4)`, n, compactKey(n), rec.Batch, u.Name); err != nil {
		if isDupErr(err) {
			c.JSON(409, gin.H{"error": "Alias \"" + n + "\" is already used."})
			return
		}
		c.JSON(500, gin.H{"error": "Could not add alias"})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Added batch alias',$2,$3)`, u.Name, rec.Batch, n)
	updated, _, _, _ := a.store.ResolveBatch(rec.Batch)
	c.JSON(201, updated)
}

func (a *App) handleRemoveAlias(c *gin.Context) {
	u := currentUser(c)
	canonical := normaliseBatch(c.Param("batch"))
	alias := normaliseAlias(c.Param("alias"))
	rec, _, _, err := a.store.ResolveBatch(canonical)
	if err != nil || rec == nil {
		c.JSON(404, gin.H{"error": "Batch not found"})
		return
	}
	res, err := a.store.db.Exec(`DELETE FROM batch_aliases WHERE alias=$1 AND batch=$2`, alias, rec.Batch)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not remove alias"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(404, gin.H{"error": "Alias not found on this batch"})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Removed batch alias',$2,$3)`, u.Name, rec.Batch, alias)
	updated, _, _, _ := a.store.ResolveBatch(rec.Batch)
	c.JSON(200, updated)
}
