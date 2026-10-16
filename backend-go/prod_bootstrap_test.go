package main

// TDD: production bootstrap — no demo/mock rows survive on live.
// Uses the isolated test DB (guardTestDB) with full seeds, then proves:
//   1. purgeDemoRows deletes demo staff/reports/demo batches;
//   2. first-batch rows (005) + their aliases + COA survive untouched;
//   3. ensureProdAdmin upserts the env admin with a verifiable bcrypt hash;
//   4. missing/short admin credentials fail closed.

import (
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func seedThenBootstrap(t *testing.T) {
	t.Helper()
	db := mustTestDB(t)
	defer db.Close()
	resetTestDB(t, db)
	if err := prodBootstrap(db); err != nil {
		t.Fatalf("prodBootstrap: %v", err)
	}
}

func TestProdBootstrapPurgesDemoStaff(t *testing.T) {
	t.Setenv("PROD_ADMIN_EMAIL", "roshan@bodylia.in")
	t.Setenv("PROD_ADMIN_PASSWORD", "glocon10-test-only")
	db := mustTestDB(t)
	defer db.Close()
	resetTestDB(t, db)
	if err := prodBootstrap(db); err != nil {
		t.Fatalf("prodBootstrap: %v", err)
	}
	for _, email := range demoStaffEmails {
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM staff_users WHERE lower(email)=lower($1)`, email).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Fatalf("demo staff %s survived prod bootstrap", email)
		}
	}
}

func TestProdBootstrapPurgesDemoReportsKeepsFirstBatch(t *testing.T) {
	t.Setenv("PROD_ADMIN_EMAIL", "roshan@bodylia.in")
	t.Setenv("PROD_ADMIN_PASSWORD", "glocon10-test-only")
	db := mustTestDB(t)
	defer db.Close()
	resetTestDB(t, db)
	if err := prodBootstrap(db); err != nil {
		t.Fatalf("prodBootstrap: %v", err)
	}
	for _, ref := range demoReportRefs {
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM reports WHERE reference=$1`, ref).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Fatalf("demo report %s survived prod bootstrap", ref)
		}
	}
	// First production batch must survive: 5 canonicals + 5 mfg aliases + COA.
	var batches, aliases, coa int
	if err := db.QueryRow(`SELECT COUNT(*) FROM batches WHERE batch LIKE '%-2610-WL01'`).Scan(&batches); err != nil {
		t.Fatal(err)
	}
	if batches != 5 {
		t.Fatalf("first batches after purge = %d, want 5", batches)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM batch_aliases WHERE alias LIKE '2K2600%'`).Scan(&aliases); err != nil {
		t.Fatal(err)
	}
	if aliases != 5 {
		t.Fatalf("mfg aliases after purge = %d, want 5", aliases)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM coa_rows WHERE batch LIKE '%-2610-WL01'`).Scan(&coa); err != nil {
		t.Fatal(err)
	}
	if coa != 35 {
		t.Fatalf("first-batch coa rows after purge = %d, want 35", coa)
	}
	// Demo interim batches are gone.
	for _, b := range demoBatches {
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM batches WHERE batch=$1`, b).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Fatalf("demo batch %s survived prod bootstrap", b)
		}
	}
}

func TestProdBootstrapAdminFromEnv(t *testing.T) {
	t.Setenv("PROD_ADMIN_EMAIL", "Roshan@Bodylia.in")
	t.Setenv("PROD_ADMIN_PASSWORD", "glocon10-test-only")
	db := mustTestDB(t)
	defer db.Close()
	resetTestDB(t, db)
	if err := prodBootstrap(db); err != nil {
		t.Fatalf("prodBootstrap: %v", err)
	}
	var hash, role, status string
	var mfa bool
	if err := db.QueryRow(`SELECT password_hash, role, status, mfa FROM staff_users WHERE email=$1`,
		"roshan@bodylia.in").Scan(&hash, &role, &status, &mfa); err != nil {
		t.Fatalf("prod admin missing: %v", err)
	}
	if role != "admin" || status != "active" || !mfa {
		t.Fatalf("prod admin flags = %s/%s/mfa=%v", role, status, mfa)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte("glocon10-test-only")); err != nil {
		t.Fatalf("prod admin hash does not verify: %v", err)
	}
	// Idempotent: second run keeps exactly one row.
	if err := prodBootstrap(db); err != nil {
		t.Fatalf("second prodBootstrap: %v", err)
	}
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM staff_users WHERE email=$1`, "roshan@bodylia.in").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("prod admin rows = %d, want 1", n)
	}
}

func TestProdBootstrapFailsClosedWithoutCreds(t *testing.T) {
	db := mustTestDB(t)
	defer db.Close()
	resetTestDB(t, db)
	t.Setenv("PROD_ADMIN_EMAIL", "")
	t.Setenv("PROD_ADMIN_PASSWORD", "")
	if err := ensureProdAdmin(db); err == nil {
		t.Fatal("ensureProdAdmin without creds must fail")
	}
	t.Setenv("PROD_ADMIN_EMAIL", "roshan@bodylia.in")
	t.Setenv("PROD_ADMIN_PASSWORD", "short")
	if err := ensureProdAdmin(db); err == nil {
		t.Fatal("ensureProdAdmin with short password must fail")
	}
}
