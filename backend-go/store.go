package main

import (
	"database/sql"
	"time"
)

// Store wraps *sql.DB with batch-domain queries.

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func (s *Store) getBatchRow(batch string) (*BatchRecord, error) {
	rec := &BatchRecord{}
	var recallReason, firstChecked, coaFile sql.NullString
	var qty sql.NullInt64
	var mrp sql.NullFloat64
	err := s.db.QueryRow(`SELECT batch, product_code, manufactured::text, expires::text,
		lab, facility, status, recall_reason, first_checked_at, coa_file_name, qty, mrp
		FROM batches WHERE batch=$1`, batch).Scan(
		&rec.Batch, &rec.Product, &rec.Manufactured, &rec.Expires,
		&rec.Lab, &rec.Facility, &rec.Status, &recallReason, &firstChecked, &coaFile, &qty, &mrp)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if recallReason.Valid {
		rec.RecallReason = &recallReason.String
	}
	if firstChecked.Valid {
		rec.FirstCheckedAt = &firstChecked.String
	}
	if coaFile.Valid {
		rec.CoaFileName = &coaFile.String
	}
	if qty.Valid {
		q := int(qty.Int64)
		rec.Qty = &q
	}
	if mrp.Valid {
		m := mrp.Float64
		rec.Mrp = &m
	}
	_ = s.db.QueryRow(`SELECT name FROM products WHERE code=$1`, rec.Product).Scan(&rec.ProductName)
	rows, err := s.db.Query(`SELECT test, specification, result, pass FROM coa_rows
		WHERE batch=$1 ORDER BY position`, batch)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	rec.Coa = []CoaRow{}
	for rows.Next() {
		var c CoaRow
		if err := rows.Scan(&c.Test, &c.Specification, &c.Result, &c.Pass); err != nil {
			return nil, err
		}
		rec.Coa = append(rec.Coa, c)
	}
	rec.Aliases, err = s.aliasesFor(batch)
	if err != nil {
		return nil, err
	}
	return rec, nil
}

func (s *Store) aliasesFor(batch string) ([]BatchAlias, error) {
	rows, err := s.db.Query(`SELECT alias, kind FROM batch_aliases WHERE batch=$1 ORDER BY alias`, batch)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BatchAlias{}
	for rows.Next() {
		var a BatchAlias
		if err := rows.Scan(&a.Code, &a.Kind); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ResolveBatch mirrors frontend resolveBatch(): exact canonical → exact mapped alias → compact.
// Returns the record, the matched alias code (nil for canonical), and the alias kind.
func (s *Store) ResolveBatch(raw string) (*BatchRecord, *string, *string, error) {
	norm := normaliseAlias(raw)
	if norm == "" {
		return nil, nil, nil, nil
	}
	canon := normaliseBatch(raw)
	if rec, err := s.getBatchRow(canon); err != nil || rec != nil {
		return rec, nil, nil, err
	}
	if canon != norm {
		if rec, err := s.getBatchRow(norm); err != nil || rec != nil {
			return rec, nil, nil, err
		}
	}
	var canonical, matched, kind string
	err := s.db.QueryRow(`SELECT batch, alias, kind FROM batch_aliases WHERE alias=$1`, norm).Scan(&canonical, &matched, &kind)
	if err == nil {
		rec, err := s.getBatchRow(canonical)
		if err != nil || rec == nil {
			return nil, nil, nil, err
		}
		m := normaliseAlias(matched)
		return rec, &m, &kind, nil
	}
	if err != sql.ErrNoRows {
		return nil, nil, nil, err
	}
	compact := compactKey(norm)
	var cbatch string
	if err := s.db.QueryRow(`SELECT batch FROM batches
		WHERE translate(upper(batch), '-_/. ', '')=$1`, compact).Scan(&cbatch); err == nil {
		rec, err := s.getBatchRow(cbatch)
		return rec, nil, nil, err
	}
	var abatch, aalias, akind string
	if err := s.db.QueryRow(`SELECT batch, alias, kind FROM batch_aliases WHERE compact_key=$1`,
		compact).Scan(&abatch, &aalias, &akind); err == nil {
		rec, err := s.getBatchRow(abatch)
		if err != nil || rec == nil {
			return nil, nil, nil, err
		}
		m := normaliseAlias(aalias)
		return rec, &m, &akind, nil
	}
	return nil, nil, nil, nil
}

func (s *Store) markChecked(batch string, now time.Time) error {
	_, err := s.db.Exec(`UPDATE batches SET first_checked_at=COALESCE(first_checked_at,$1),
		updated_at=NOW() WHERE batch=$2`, now.UTC().Format(time.RFC3339), batch)
	return err
}

func (s *Store) logLookup(input string, canonical, matched *string, verdict, ip string) {
	var c, m sql.NullString
	if canonical != nil {
		c = sql.NullString{String: *canonical, Valid: true}
	}
	if matched != nil {
		m = sql.NullString{String: *matched, Valid: true}
	}
	_, _ = s.db.Exec(`INSERT INTO lookups (input, batch_canonical, matched_alias, verdict, ip)
		VALUES ($1,$2,$3,$4,$5)`, normaliseAlias(input), c, m, verdict, ip)
}

func (s *Store) rateLimitPerMinute() int {
	if ov := rateLimitOverride(); ov > 0 {
		return ov
	}
	var n int
	if err := s.db.QueryRow(`SELECT rate_limit_per_minute FROM settings WHERE id=1`).Scan(&n); err != nil {
		return 10
	}
	return n
}

func (s *Store) countRecentLookups(ip string) int {
	var n int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM lookups
		WHERE ip=$1 AND at > NOW() - INTERVAL '60 seconds'`, ip).Scan(&n)
	return n
}
