package main

import (
	"github.com/gin-gonic/gin"
	"time"
)

// Public BFF: GET /bff/v1/batches/:batch → genuine | expired | recalled | 404 | 429

func (a *App) handleLookup(c *gin.Context) {
	raw := c.Param("batch")
	ip := c.ClientIP()
	if a.store.countRecentLookups(ip) >= a.store.rateLimitPerMinute() {
		c.JSON(429, gin.H{"kind": "rate_limited", "retryAfterSeconds": 60})
		return
	}
	norm := normaliseAlias(raw)
	if len(norm) < 3 || len(norm) > 40 {
		a.store.logLookup(raw, nil, nil, "not_found", ip)
		c.JSON(404, gin.H{"kind": "not_found"})
		return
	}
	rec, matched, kind, err := a.store.ResolveBatch(raw)
	if err != nil {
		c.JSON(500, gin.H{"kind": "error"})
		return
	}
	if rec == nil {
		a.store.logLookup(raw, nil, nil, "not_found", ip)
		c.JSON(404, gin.H{"kind": "not_found"})
		return
	}
	now := time.Now()
	_ = a.store.markChecked(rec.Batch, now)
	out := LookupResult{}
	if rec.Status == "recalled" {
		out.Kind = "recalled"
	} else if rec.Expires < now.Format("2006-01-02") {
		out.Kind = "expired"
	} else {
		out.Kind = "genuine"
	}
	out.Record = rec
	out.MatchedAlias = matched
	out.MatchedKind = kind
	a.store.logLookup(raw, &rec.Batch, matched, out.Kind, ip)
	c.JSON(200, out)
}

// GET /bff/v1/recalls → active recalls
func (a *App) handleRecalls(c *gin.Context) {
	rows, err := a.store.db.Query(`SELECT batch FROM batches WHERE status='recalled' ORDER BY updated_at DESC`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load recalls"})
		return
	}
	defer rows.Close()
	out := []*BatchRecord{}
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err != nil {
			continue
		}
		rec, err := a.store.getBatchRow(b)
		if err != nil || rec == nil {
			continue
		}
		out = append(out, rec)
	}
	if out == nil {
		out = []*BatchRecord{}
	}
	c.JSON(200, out)
}
