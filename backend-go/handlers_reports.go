package main

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// POST /bff/v1/reports → 201 { reference }

func (a *App) handleSubmitReport(c *gin.Context) {
	var in struct {
		FullName string `json:"fullName"`
		Email    string `json:"email"`
		Phone    string `json:"phone"`
		Batch    string `json:"batch"`
		Channel  string `json:"channel"`
		Message  string `json:"message"`
		Consent  bool   `json:"consent"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body"})
		return
	}
	in.FullName = strings.TrimSpace(in.FullName)
	in.Email = strings.TrimSpace(in.Email)
	in.Batch = normaliseAlias(in.Batch)
	if len(in.FullName) < 2 || len(in.FullName) > 80 {
		c.JSON(400, gin.H{"error": "Enter your full name."})
		return
	}
	if !strings.Contains(in.Email, "@") {
		c.JSON(400, gin.H{"error": "Enter an email like name@example.com."})
		return
	}
	if len(in.Batch) < 3 || len(in.Batch) > 40 {
		c.JSON(400, gin.H{"error": "Enter the batch number printed on your pack."})
		return
	}
	if len(in.Message) < 20 || len(in.Message) > 1000 {
		c.JSON(400, gin.H{"error": "Tell us a little more — at least 20 characters."})
		return
	}
	if !in.Consent {
		c.JSON(400, gin.H{"error": "Confirm we may contact you about this report."})
		return
	}
	rec, _, _ := a.store.ResolveBatch(in.Batch)
	var canonical sql.NullString
	if rec != nil {
		canonical = sql.NullString{String: rec.Batch, Valid: true}
	}
	now := nowTime()
	ref := "SR-" + now.Format("2006") + "-" + nextReportSeq(a.store)
	var phone sql.NullString
	if strings.TrimSpace(in.Phone) != "" {
		phone = sql.NullString{String: strings.TrimSpace(in.Phone), Valid: true}
	}
	tx, err := a.store.db.Begin()
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not save report"})
		return
	}
	_, err = tx.Exec(`INSERT INTO reports
		(reference, full_name, email, phone, batch_input, batch_canonical, channel, message, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new')`,
		ref, in.FullName, in.Email, phone, in.Batch, canonical, in.Channel, in.Message)
	if err != nil {
		tx.Rollback()
		c.JSON(500, gin.H{"error": "Could not save report"})
		return
	}
	_, _ = tx.Exec(`INSERT INTO report_timeline (reference, by, kind, text)
		VALUES ($1,'Customer','received','Report received via batch.bodylia.in')`, ref)
	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Could not save report"})
		return
	}
	c.JSON(201, gin.H{"reference": ref})
}

func nextReportSeq(s *Store) string {
	var n int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM reports`).Scan(&n)
	seq := 4822 + n
	str := "00000" + itoa(seq%100000)
	return str[len(str)-5:]
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// POST /bff/v1/reports/track → { found, report? } (reference AND email must match)
func (a *App) handleTrackReport(c *gin.Context) {
	var in struct {
		Reference string `json:"reference"`
		Email     string `json:"email"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(200, gin.H{"found": false})
		return
	}
	rep, err := a.getReport(strings.ToUpper(strings.TrimSpace(in.Reference)))
	if err != nil || rep == nil || !strings.EqualFold(rep.Email, strings.TrimSpace(in.Email)) {
		c.JSON(200, gin.H{"found": false})
		return
	}
	c.JSON(200, gin.H{"found": true, "report": rep})
}

var _ = http.StatusOK
