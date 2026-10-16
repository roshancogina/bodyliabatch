package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"testing"

	_ "github.com/lib/pq"
)

func testConnStr() string {
	host := getenv("DB_HOST", "localhost")
	// CI runners create the postgres superuser (bodylia); local macOS default
	// is the login user (roshanshah). DB_USER wins, E2E_DB_USER is fallback.
	user := getenv("DB_USER", getenv("E2E_DB_USER", "roshanshah"))
	name := getenv("DB_NAME", "bodyliabatch_test")
	if pw := getenv("DB_PASSWORD", ""); pw != "" {
		return fmt.Sprintf("host=%s port=5432 user=%s password=%s dbname=%s sslmode=disable", host, user, pw, name)
	}
	return fmt.Sprintf("host=%s port=5432 user=%s dbname=%s sslmode=disable", host, user, name)
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func mustTestDB(t *testing.T) *sql.DB {
	t.Helper()
	os.Setenv("APP_ENV", "test")
	dbName := getenv("DB_NAME", "bodyliabatch_test")
	guardTestDB(dbName)
	db, err := sql.Open("postgres", testConnStr())
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Fatalf("ping test db: %v", err)
	}
	// Isolation bootstrap: run the SAME ordered migration ledger production
	// uses, so tests never depend on ambient schema (fresh CI service DBs
	// start empty — seeds/relax steps assume 001's tables exist).
	if err := applyMigrations(db, "migrations"); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	return db
}

// resetTestDB re-applies seeds so every test starts from identical master data.
// Seeds 002/003 carry legacy rows; 004 remaps to the interim standard and 005
// lands the first production batch (XX-NNNN-XXNN). Constraints are relaxed for
// the replay and re-applied by 004/005.
func resetTestDB(t *testing.T, db *sql.DB) {
	t.Helper()
	if _, err := db.Exec(`ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_batch_check;
		ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_product_check;
		ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_alias_check;
		ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_format_check;
		ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_not_canonical_check;`); err != nil {
		t.Fatalf("relax constraints: %v", err)
	}
	// Wipe ALL test-created reports and staff BEFORE the seed replay (report
	// cascade clears timeline/escalations). The old `reference NOT LIKE
	// 'SR-2026-%'` wipe never matched test-created reports (same pattern as
	// the seeds), and bootstrap tests left extra staff rows behind — counts
	// silently grew across runs, making aggregate assertions order-dependent.
	if _, err := db.Exec(`DELETE FROM reports`); err != nil {
		t.Fatalf("reset reports: %v", err)
	}
	if _, err := db.Exec(`DELETE FROM staff_users`); err != nil {
		t.Fatalf("reset staff: %v", err)
	}
	for _, f := range []string{"migrations/002_seed_master_data.sql", "migrations/003_seed_coa_reports_users.sql", "migrations/004_uibatch_standard.sql", "migrations/005_first_batch.sql"} {
		sqlBytes, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		if _, err := db.Exec(string(sqlBytes)); err != nil {
			t.Fatalf("reseed %s: %v", f, err)
		}
	}
	// Wipe test-created lookups beyond the seeded state (none are seeded)
	if _, err := db.Exec(`DELETE FROM lookups`); err != nil {
		log.Printf("reset lookups: %v", err)
	}
	if _, err := db.Exec(`DELETE FROM batches WHERE batch NOT IN
		('PE-2610-WL01','FE-2610-WL01','FN-2610-WL01','MB-2610-WL01','CI-2610-WL01',
		 'MB-2203-MB45','PH-2504-PH77','FN-2501-FN01')`); err != nil {
		t.Fatalf("reset batches: %v", err)
	}
}
