package main

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var jsonUnmarshal = json.Unmarshal

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
	rec, _, _, err := a.store.ResolveBatch(c.Param("batch"))
	if err != nil || rec == nil {
		c.JSON(404, gin.H{"error": "Batch not found"})
		return
	}
	c.JSON(200, rec)
}

// AliasInput accepts {code, kind} objects; legacy plain strings default to manufacturer.
type AliasInput struct {
	Code string `json:"code"`
	Kind string `json:"kind"`
}

// UnmarshalJSON accepts {"code","kind"} objects AND legacy plain strings.
func (a *AliasInput) UnmarshalJSON(data []byte) error {
	var s string
	if err := jsonUnmarshal(data, &s); err == nil {
		a.Code = s
		a.Kind = "manufacturer"
		return nil
	}
	type alias AliasInput
	var o alias
	if err := jsonUnmarshal(data, &o); err != nil {
		return err
	}
	a.Code, a.Kind = o.Code, o.Kind
	return nil
}

func (a AliasInput) normalised() (code, kind string) {
	if a.Code != "" {
		code = normaliseAlias(a.Code)
		kind = a.Kind
		if kind != "label" {
			kind = "manufacturer"
		}
		return code, kind
	}
	// Legacy: plain string in the Kind field position never happens via JSON;
	// kept for forward-compat if callers send raw strings (unmarshals to Code="").
	return "", ""
}

type normAlias struct{ code, kind string }

func normAliasList(ns []normAlias) string {
	codes := make([]string, 0, len(ns))
	for _, na := range ns {
		codes = append(codes, na.kind+":"+na.code)
	}
	return codesJoined(codes)
}

func codesJoined(codes []string) string {
	out := ""
	for i, c := range codes {
		if i > 0 {
			out += ", "
		}
		out += c
	}
	return out
}

// POST /api/admin/batches — register canonical + optional mapped codes
func (a *App) handleAdminRegisterBatch(c *gin.Context) {
	var in struct {
		Batch        string   `json:"batch"`
		Product      string   `json:"product"`
		Manufactured string   `json:"manufactured"`
		Expires      string   `json:"expires"`
		Facility     string   `json:"facility"`
		Lab          string   `json:"lab"`
		Aliases      []AliasInput `json:"aliases"`
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
		c.JSON(400, gin.H{"error": canonicalBatchError(in.Batch)})
		return
	}
	if batch[0:2] != product {
		c.JSON(400, gin.H{"error": "Product must match the two-letter code at the start of the batch number."})
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
	norms := []normAlias{}
	seen := map[string]bool{}
	for _, raw := range in.Aliases {
		n, k := raw.normalised()
		if n == "" {
			continue
		}
		if !isValidAlias(n) || n == batch {
			c.JSON(400, gin.H{"error": "Mapped code " + n + " is not a valid manufacturer or label code."})
			return
		}
		if seen[n] {
			c.JSON(400, gin.H{"error": "Remove duplicate mapped codes."})
			return
		}
		seen[n] = true
		if owner := aliasClashDetail(a.store, n, ""); owner != "" {
			c.JSON(409, gin.H{"error": "\"" + n + "\" is already used by " + owner + "."})
			return
		}
		norms = append(norms, normAlias{code: n, kind: k})
	}
	if len(norms) > 20 {
		c.JSON(400, gin.H{"error": "At most 20 mapped codes per batch."})
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
		if _, err := tx.Exec(`INSERT INTO batch_aliases (alias, compact_key, batch, kind, created_by)
			VALUES ($1,$2,$3,$4,$5)`, al.code, compactKey(al.code), batch, al.kind, u.Name); err != nil {
			tx.Rollback()
			if isDupErr(err) {
				c.JSON(409, gin.H{"error": "Mapped code \"" + al.code + "\" is already used."})
				return
			}
			c.JSON(500, gin.H{"error": "Could not save mapped codes"})
			return
		}
	}
	detail := ""
	if len(norms) > 0 {
		detail = "mapped codes: " + normAliasList(norms)
	}
	_, _ = tx.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Registered batch',$2,$3)`, u.Name, batch, sql.NullString{String: detail, Valid: detail != ""})
	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Could not register batch"})
		return
	}
	rec, _, _, _ := a.store.ResolveBatch(batch)
	c.JSON(201, rec)
}
