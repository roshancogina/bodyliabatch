package main

import "strings"

// SearchBatches: canonical/alias/compact substring + product name (admin list).
func (s *Store) SearchBatches(q string) ([]*BatchRecord, error) {
	norm := normaliseAlias(q)
	if norm == "" {
		return s.listAllBatches()
	}
	compact := compactKey(norm)
	like := "%" + norm + "%"
	clike := "%" + compact + "%"
	rows, err := s.db.Query(`
		SELECT DISTINCT b.batch FROM batches b
		LEFT JOIN batch_aliases a ON a.batch = b.batch
		LEFT JOIN products p ON p.code = b.product_code
		WHERE b.batch LIKE $1
		   OR a.alias LIKE $1
		   OR translate(upper(b.batch), '-_/. ', '') LIKE $2
		   OR a.compact_key LIKE $2
		   OR upper(p.name) LIKE $1
		ORDER BY b.batch`, like, clike)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*BatchRecord
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		rec, err := s.getBatchRow(b)
		if err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (s *Store) listAllBatches() ([]*BatchRecord, error) {
	rows, err := s.db.Query(`SELECT batch FROM batches ORDER BY manufactured DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*BatchRecord
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		rec, err := s.getBatchRow(b)
		if err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

// aliasClashDetail returns the owning canonical batch when an alias collides
// anywhere in the global namespace (canonical or alias, exact or compact).
func aliasClashDetail(s *Store, alias, excludeBatch string) string {
	var owner string
	if err := s.db.QueryRow(`SELECT batch FROM batches WHERE batch=$1`, alias).Scan(&owner); err == nil && owner != excludeBatch {
		return owner
	}
	if err := s.db.QueryRow(`SELECT batch FROM batch_aliases WHERE alias=$1 OR compact_key=$2`,
		alias, compactKey(alias)).Scan(&owner); err == nil && owner != excludeBatch {
		return owner
	}
	if err := s.db.QueryRow(`SELECT batch FROM batches
		WHERE translate(upper(batch),'-_/. ','')=$1`, compactKey(alias)).Scan(&owner); err == nil && owner != excludeBatch && owner != "" {
		return owner
	}
	return ""
}

func isDupErr(err error) bool {
	return err != nil && strings.Contains(err.Error(), "duplicate key")
}
