package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

// applyMigrations runs every *.sql file in dir exactly once, in name order,
// recording each in schema_migrations. Idempotent: re-runs skip applied files.
func applyMigrations(db *sql.DB, dir string) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); err != nil {
		return fmt.Errorf("migrations ledger: %w", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	for _, f := range files {
		var count int
		if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version=$1`, f).Scan(&count); err != nil {
			return fmt.Errorf("check migration %s: %w", f, err)
		}
		if count > 0 {
			log.Printf("migration %s already applied — skipping", f)
			continue
		}
		sqlBytes, err := os.ReadFile(dir + "/" + f)
		if err != nil {
			return fmt.Errorf("read %s: %w", f, err)
		}
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(sqlBytes)); err != nil {
			tx.Rollback()
			return fmt.Errorf("apply %s: %w", f, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (version) VALUES ($1)`, f); err != nil {
			tx.Rollback()
			return fmt.Errorf("record %s: %w", f, err)
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		log.Printf("migration %s applied", f)
	}
	return nil
}

func mustApplyMigrations(db *sql.DB, dir string) {
	for i := 0; i < 3; i++ {
		if err := applyMigrations(db, dir); err == nil {
			return
		} else if i == 2 {
			log.Fatalf("migrations failed: %v", err)
		}
		time.Sleep(2 * time.Second)
	}
}
