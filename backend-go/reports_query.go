package main

import (
	"database/sql"
	"time"
)

// getReport loads a report with its timeline events.

func (a *App) getReport(ref string) (*Report, error) {
	rep := &Report{}
	var phone, photo, assignee, orderNum, purchDate sql.NullString
	var batchVerified sql.NullBool
	err := a.store.db.QueryRow(`SELECT reference, full_name, email, phone, batch_input,
		channel, message, photo_name, created_at, status, assignee,
		order_number, purchase_date, COALESCE(batch_verified, FALSE)
		FROM reports WHERE reference=$1`, ref).Scan(
		&rep.Reference, &rep.FullName, &rep.Email, &phone, &rep.Batch,
		&rep.Channel, &rep.Message, &photo, &rep.CreatedAt, &rep.Status, &assignee,
		&orderNum, &purchDate, &batchVerified)
	if err != nil {
		return nil, err
	}
	if phone.Valid {
		rep.Phone = &phone.String
	}
	if photo.Valid {
		rep.PhotoName = &photo.String
	}
	if assignee.Valid {
		rep.Assignee = &assignee.String
	}
	if orderNum.Valid {
		rep.OrderNumber = &orderNum.String
	}
	if purchDate.Valid {
		rep.PurchaseDate = &purchDate.String
	}
	if batchVerified.Valid {
		rep.BatchVerified = batchVerified.Bool
	}
	trows, err := a.store.db.Query(`SELECT at, by, kind, text FROM report_timeline
		WHERE reference=$1 ORDER BY at`, ref)
	if err != nil {
		return rep, nil
	}
	defer trows.Close()
	rep.Timeline = []TimelineEvent{}
	for trows.Next() {
		var ev TimelineEvent
		if err := trows.Scan(&ev.At, &ev.By, &ev.Kind, &ev.Text); err == nil {
			rep.Timeline = append(rep.Timeline, ev)
		}
	}
	return rep, nil
}

func nowTime() time.Time { return time.Now() }
