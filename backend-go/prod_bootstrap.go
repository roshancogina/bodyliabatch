package main

// Production bootstrap: runs AFTER migrations, ONLY when APP_ENV=production.
// No mock/test/demo rows may survive on the live site:
//   1. purgeDemoRows removes seeded demo staff, demo reports/timelines/escalations,
//      and legacy demo batches (interim XX-NNNN-XXNN shapes from 004).
//      Real first-batch rows (005: *-2610-WL01 + 2K2600x aliases + COA) are kept.
//   2. ensureProdAdmin upserts the single production admin from env
//      (PROD_ADMIN_EMAIL + PROD_ADMIN_PASSWORD, bcrypt-hashed at boot —
//      no hash is ever stored in code, config files, or the repo).
// Both steps are idempotent and run inside one transaction each.
// Local/dev/test are untouched: main() calls this only when isProd().

import (
	"database/sql"
	"fmt"
	"log"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// demoStaffEmails are seeded preview accounts (003) — never on production.
var demoStaffEmails = []string{
	"admin@bodylia.in",
	"qa@bodylia.in",
	"support@bodylia.in",
	"vikram.r@bodylia.in",
	"kabir.m@bodylia.in",
	"farah.k@bodylia.in",
}

// demoReportRefs are seeded demo reports (003) — never on production.
var demoReportRefs = []string{
	"SR-2026-04821",
	"SR-2026-04817",
	"SR-2026-04790",
	"SR-2026-04712",
}

// demoBatches are interim demo shapes from 004 (expired/recalled/placeholder
// rows used by local tests) — never on production. First-batch rows (005)
// never match: they end in -WL01 and carry qty/mrp.
var demoBatches = []string{
	"FR-2509-FR12",
	"CN-2510-CN80",
	"MB-2203-MB45",
	"PH-2504-PH77",
	"FN-2501-FN01",
}

func prodBootstrap(db *sql.DB) error {
	if err := purgeDemoRows(db); err != nil {
		return fmt.Errorf("purge demo rows: %w", err)
	}
	if err := ensureProdAdmin(db); err != nil {
		return fmt.Errorf("ensure prod admin: %w", err)
	}
	return nil
}

func purgeDemoRows(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	rollback := func() { _ = tx.Rollback() }
	q := func(query string, args ...any) error {
		if _, err := tx.Exec(query, args...); err != nil {
			rollback()
			return err
		}
		return nil
	}
	// Purge demo reports (explicit refs and any demo @example.com addresses)
	if err := q(`DELETE FROM report_timeline WHERE reference IN (SELECT reference FROM reports WHERE email LIKE '%@example.com')`); err != nil {
		return err
	}
	if err := q(`DELETE FROM escalations WHERE reference IN (SELECT reference FROM reports WHERE email LIKE '%@example.com')`); err != nil {
		return err
	}
	if err := q(`DELETE FROM reports WHERE email LIKE '%@example.com'`); err != nil {
		return err
	}
	for _, ref := range demoReportRefs {
		if err := q(`DELETE FROM report_timeline WHERE reference=$1`, ref); err != nil {
			return err
		}
		if err := q(`DELETE FROM escalations WHERE reference=$1`, ref); err != nil {
			return err
		}
		if err := q(`DELETE FROM reports WHERE reference=$1`, ref); err != nil {
			return err
		}
	}
	for _, email := range demoStaffEmails {
		if err := q(`DELETE FROM staff_users WHERE lower(email)=lower($1)`, email); err != nil {
			return err
		}
	}
	for _, b := range demoBatches {
		if err := q(`DELETE FROM batches WHERE batch=$1`, b); err != nil {
			return err
		}
	}
	if err := q(`DELETE FROM batches WHERE batch LIKE 'BDL-%'`); err != nil {
		return err
	}
	if err := q(`DELETE FROM batch_aliases WHERE created_by='seed' AND batch NOT IN (SELECT batch FROM batches WHERE batch LIKE '%-2610-WL01')`); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	log.Printf("prod bootstrap: demo rows purged (staff=%d reports=%d batches=%d)",
		len(demoStaffEmails), len(demoReportRefs), len(demoBatches))
	return nil
}

func ensureProdAdmin(db *sql.DB) error {
	email := strings.ToLower(strings.TrimSpace(envOr("PROD_ADMIN_EMAIL", "")))
	password := envOr("PROD_ADMIN_PASSWORD", "")
	if email == "" || password == "" {
		return fmt.Errorf("PROD_ADMIN_EMAIL and PROD_ADMIN_PASSWORD are required in production")
	}
	if len(password) < 8 {
		return fmt.Errorf("PROD_ADMIN_PASSWORD must be at least 8 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash admin password: %w", err)
	}
	name := strings.TrimSpace(envOr("PROD_ADMIN_NAME", ""))
	if name == "" {
		name = "Bodylia Admin"
	}
	_, err = db.Exec(`INSERT INTO staff_users (name, email, password_hash, role, status, mfa)
		VALUES ($1, lower($2), $3, 'admin', 'active', TRUE)
		ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash,
			name=EXCLUDED.name, role='admin', status='active', mfa=TRUE`,
		name, email, string(hash))
	if err != nil {
		return err
	}
	log.Printf("prod bootstrap: admin %s ensured", email)
	return nil
}
