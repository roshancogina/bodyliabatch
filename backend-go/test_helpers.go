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
	user := getenv("DB_USER", "roshanshah")
	name := getenv("DB_NAME", "bodyliabatch_test")
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
	return db
}

// resetTestDB re-applies seeds so every test starts from identical master data.
func resetTestDB(t *testing.T, db *sql.DB) {
	t.Helper()
	for _, f := range []string{"migrations/002_seed_master_data.sql", "migrations/003_seed_coa_reports_users.sql"} {
		sqlBytes, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		if _, err := db.Exec(string(sqlBytes)); err != nil {
			t.Fatalf("reseed %s: %v", f, err)
		}
	}
	// Wipe test-created reports/lookups/batches beyond the 4 seeded canonicals
	if _, err := db.Exec(`DELETE FROM lookups`); err != nil {
		log.Printf("reset lookups: %v", err)
	}
	if _, err := db.Exec(`DELETE FROM reports WHERE reference NOT LIKE 'SR-2026-%'`); err != nil {
		t.Fatalf("reset reports: %v", err)
	}
	if _, err := db.Exec(`DELETE FROM batches WHERE batch NOT IN
		('BDL-FR-2509-0312','BDL-CN-2510-1180','BDL-MB-2203-0045','BDL-PH-2504-0777')`); err != nil {
		t.Fatalf("reset batches: %v", err)
	}
}
