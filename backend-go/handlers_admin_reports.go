package main

// Admin console: customer reports + escalations (JWT staff session).
// Every mutation writes a report_timeline event and an audit_log row.

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var reportStatuses = map[string]bool{
	"new": true, "investigating": true, "resolved_genuine": true, "resolved_counterfeit": true,
}

type ReportSummary struct {
	Reference     string    `json:"reference"`
	FullName      string    `json:"fullName"`
	Email         string    `json:"email"`
	Batch         string    `json:"batch"`
	Channel       string    `json:"channel"`
	OrderNumber   *string   `json:"orderNumber,omitempty"`
	PurchaseDate  *string   `json:"purchaseDate,omitempty"`
	BatchVerified bool      `json:"batchVerified"`
	Message       string    `json:"message"`
	Status        string    `json:"status"`
	Assignee      *string   `json:"assignee,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
	PhotoName     *string   `json:"photoName,omitempty"`
}

// GET /api/admin/reports
func (a *App) handleAdminListReports(c *gin.Context) {
	status := strings.TrimSpace(c.Query("status"))
	q := strings.TrimSpace(c.Query("q"))
	query := `SELECT reference, full_name, email, batch_input, channel, message, status,
		assignee, created_at, updated_at, photo_name,
		order_number, purchase_date, COALESCE(batch_verified, FALSE) FROM reports`
	where := []string{}
	args := []any{}
	if status != "" && status != "all" {
		if status == "open" {
			where = append(where, `status IN ('new','investigating')`)
		} else if reportStatuses[status] {
			where = append(where, `status=$1`)
			args = append(args, status)
		} else {
			c.JSON(400, gin.H{"error": "Unknown status filter."})
			return
		}
	}
	if q != "" {
		ph := fmt.Sprintf("$%d", len(args)+1)
		where = append(where, `(reference ILIKE `+ph+` OR full_name ILIKE `+ph+` OR email ILIKE `+ph+` OR batch_input ILIKE `+ph+`)`)
		args = append(args, "%"+q+"%")
	}
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY created_at DESC LIMIT 500"
	rows, err := a.store.db.Query(query, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load reports."})
		return
	}
	defer rows.Close()
	out := []ReportSummary{}
	for rows.Next() {
		var r ReportSummary
		var assignee, photo, orderNum, purchDate sql.NullString
		var batchVerified sql.NullBool
		if err := rows.Scan(&r.Reference, &r.FullName, &r.Email, &r.Batch, &r.Channel,
			&r.Message, &r.Status, &assignee, &r.CreatedAt, &r.UpdatedAt, &photo,
			&orderNum, &purchDate, &batchVerified); err != nil {
			c.JSON(500, gin.H{"error": "Could not read report row."})
			return
		}
		if assignee.Valid {
			r.Assignee = &assignee.String
		}
		if photo.Valid {
			r.PhotoName = &photo.String
		}
		if orderNum.Valid {
			r.OrderNumber = &orderNum.String
		}
		if purchDate.Valid {
			r.PurchaseDate = &purchDate.String
		}
		if batchVerified.Valid {
			r.BatchVerified = batchVerified.Bool
		}
		out = append(out, r)
	}
	c.JSON(200, out)
}

// GET /api/admin/reports/:ref
func (a *App) handleAdminGetReport(c *gin.Context) {
	rep, err := a.getReport(c.Param("ref"))
	if err != nil {
		c.JSON(404, gin.H{"error": "Report not found."})
		return
	}
	c.JSON(200, rep)
}

// PATCH /api/admin/reports/:ref — { status?, note?, assignee? }
func (a *App) handleAdminUpdateReport(c *gin.Context) {
	var in struct {
		Status   string  `json:"status"`
		Note     string  `json:"note"`
		Assignee *string `json:"assignee"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body."})
		return
	}
	ref := c.Param("ref")
	if _, err := a.getReport(ref); err != nil {
		c.JSON(404, gin.H{"error": "Report not found."})
		return
	}
	u := currentUser(c)
	if in.Status != "" && !reportStatuses[in.Status] {
		c.JSON(400, gin.H{"error": "Unknown report status."})
		return
	}
	note := strings.TrimSpace(in.Note)
	if in.Status == "" && note == "" && in.Assignee == nil {
		c.JSON(400, gin.H{"error": "Send a status, a note or an assignee."})
		return
	}
	if note != "" && (len(note) < 2 || len(note) > 1000) {
		c.JSON(400, gin.H{"error": "Notes must be 2–1000 characters."})
		return
	}
	tx, err := a.store.db.Begin()
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not update report."})
		return
	}
	rollback := func() { _ = tx.Rollback() }
	if in.Status != "" {
		if _, err := tx.Exec(`UPDATE reports SET status=$1, updated_at=NOW() WHERE reference=$2`, in.Status, ref); err != nil {
			rollback()
			c.JSON(500, gin.H{"error": "Could not update status."})
			return
		}
		if _, err := tx.Exec(`INSERT INTO report_timeline (reference, by, kind, text)
			VALUES ($1,$2,'status',$3)`, ref, u.Name, "Status → "+in.Status); err != nil {
			rollback()
			c.JSON(500, gin.H{"error": "Could not record timeline."})
			return
		}
	}
	if in.Assignee != nil {
		assignee := strings.TrimSpace(*in.Assignee)
		if _, err := tx.Exec(`UPDATE reports SET assignee=NULLIF($1,''), updated_at=NOW() WHERE reference=$2`, assignee, ref); err != nil {
			rollback()
			c.JSON(500, gin.H{"error": "Could not assign report."})
			return
		}
		text := "Assigned to " + assignee
		if assignee == "" {
			text = "Assignee removed"
		}
		if _, err := tx.Exec(`INSERT INTO report_timeline (reference, by, kind, text)
			VALUES ($1,$2,'assign',$3)`, ref, u.Name, text); err != nil {
			rollback()
			c.JSON(500, gin.H{"error": "Could not record timeline."})
			return
		}
	}
	if note != "" {
		if _, err := tx.Exec(`INSERT INTO report_timeline (reference, by, kind, text)
			VALUES ($1,$2,'note',$3)`, ref, u.Name, note); err != nil {
			rollback()
			c.JSON(500, gin.H{"error": "Could not save note."})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Could not update report."})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Updated report',$2,$3)`, u.Name, ref, reportAuditDetail(in.Status, note, in.Assignee))
	rep, _ := a.getReport(ref)
	if in.Status != "" && rep != nil {
		_ = deliverReportStatusCustomerEmail(rep.Email, rep.FullName, ref, rep.Batch, in.Status, note)
	}
	c.JSON(200, rep)
}

func reportAuditDetail(status, note string, assignee *string) string {
	parts := []string{}
	if status != "" {
		parts = append(parts, "status → "+status)
	}
	if assignee != nil {
		parts = append(parts, "assignee: "+*assignee)
	}
	if note != "" {
		parts = append(parts, "note added")
	}
	return strings.Join(parts, "; ")
}

// POST /api/admin/reports/:ref/escalate — { reason, urgency }
func (a *App) handleAdminEscalateReport(c *gin.Context) {
	var in struct {
		Reason  string `json:"reason"`
		Urgency string `json:"urgency"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body."})
		return
	}
	ref := c.Param("ref")
	rep, err := a.getReport(ref)
	if err != nil || rep == nil {
		c.JSON(404, gin.H{"error": "Report not found."})
		return
	}
	reason := strings.TrimSpace(in.Reason)
	if len(reason) < 10 {
		c.JSON(400, gin.H{"error": "Explain the escalation in at least 10 characters."})
		return
	}
	if in.Urgency != "urgent" {
		in.Urgency = "standard"
	}
	u := currentUser(c)
	tx, err := a.store.db.Begin()
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not escalate report."})
		return
	}
	if _, err := tx.Exec(`INSERT INTO escalations (reference, by, reason, urgency)
		VALUES ($1,$2,$3,$4)`, ref, u.Name, reason, in.Urgency); err != nil {
		_ = tx.Rollback()
		if isDupErr(err) {
			c.JSON(409, gin.H{"error": "This report is already escalated."})
			return
		}
		c.JSON(500, gin.H{"error": "Could not escalate report."})
		return
	}
	if _, err := tx.Exec(`INSERT INTO report_timeline (reference, by, kind, text)
		VALUES ($1,$2,'escalation',$3)`, ref, u.Name, "Escalated ("+in.Urgency+"): "+reason); err != nil {
		_ = tx.Rollback()
		c.JSON(500, gin.H{"error": "Could not record timeline."})
		return
	}
	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Could not escalate report."})
		return
	}
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Escalated report',$2,$3)`, u.Name, ref, "urgency: "+in.Urgency)
	_ = deliverReportEscalatedEmail(ref, rep.Batch, in.Urgency, in.Reason, u.Name)
	c.JSON(201, gin.H{"reference": ref, "urgency": in.Urgency})
}

type EscalationOut struct {
	Reference string    `json:"reference"`
	By        string    `json:"by"`
	At        time.Time `json:"at"`
	Reason    string    `json:"reason"`
	Urgency   string    `json:"urgency"`
	State     string    `json:"state"`
	HandledBy *string   `json:"handledBy,omitempty"`
}

// GET /api/admin/escalations
func (a *App) handleAdminListEscalations(c *gin.Context) {
	state := strings.TrimSpace(c.Query("state"))
	query := `SELECT reference, by, at, reason, urgency, state, handled_by FROM escalations`
	args := []any{}
	if state != "" && state != "all" {
		if state != "open" && state != "accepted" && state != "returned" {
			c.JSON(400, gin.H{"error": "Unknown escalation state."})
			return
		}
		query += " WHERE state=$1"
		args = append(args, state)
	}
	query += " ORDER BY CASE urgency WHEN 'urgent' THEN 0 ELSE 1 END, at DESC"
	rows, err := a.store.db.Query(query, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load escalations."})
		return
	}
	defer rows.Close()
	out := []EscalationOut{}
	for rows.Next() {
		var e EscalationOut
		var handledBy sql.NullString
		if err := rows.Scan(&e.Reference, &e.By, &e.At, &e.Reason, &e.Urgency, &e.State, &handledBy); err != nil {
			c.JSON(500, gin.H{"error": "Could not read escalation row."})
			return
		}
		if handledBy.Valid {
			e.HandledBy = &handledBy.String
		}
		out = append(out, e)
	}
	c.JSON(200, out)
}

// PATCH /api/admin/escalations/:ref — { state: accepted|returned }
func (a *App) handleAdminHandleEscalation(c *gin.Context) {
	var in struct {
		State string `json:"state"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body."})
		return
	}
	if in.State != "accepted" && in.State != "returned" {
		c.JSON(400, gin.H{"error": "Escalation state must be accepted or returned."})
		return
	}
	ref := c.Param("ref")
	u := currentUser(c)
	res, err := a.store.db.Exec(`UPDATE escalations SET state=$1, handled_by=$2
		WHERE reference=$3 AND state='open'`, in.State, u.Name, ref)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not update escalation."})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(409, gin.H{"error": "No open escalation for this report."})
		return
	}
	text := "Escalation accepted by " + u.Name
	if in.State == "returned" {
		text = "Escalation returned by " + u.Name
	}
	_, _ = a.store.db.Exec(`INSERT INTO report_timeline (reference, by, kind, text)
		VALUES ($1,$2,'escalation',$3)`, ref, u.Name, text)
	_, _ = a.store.db.Exec(`INSERT INTO audit_log (actor, action, target, detail)
		VALUES ($1,'Handled escalation',$2,$3)`, u.Name, ref, in.State)
	c.JSON(200, gin.H{"reference": ref, "state": in.State})
}
