-- Migration: 004 — UIBatch canonical standard XX-NNNN-XXNN + alias kinds
-- (spaces stripped/ignored everywhere).
--   XX   — 2 alphanumeric chars (A-Z, 0-9)
--   NNNN — 4 digits
--   XXNN — 2 alphanumerics + 2 digits (e.g. WL01)
-- Replaces the legacy BDL-<PRODUCT>-<YYMM>-<NNNN> format.
--   * batches.batch CHECK becomes ^[A-Z0-9]{2}-[0-9]{4}-[A-Z0-9]{2}[0-9]{2}$ with the
--     product cross-check on the FIRST 2 chars (XX identifies the product).
--   * batch_aliases gains kind (manufacturer | label); legacy rows default
--     to manufacturer. Canonical-shaped aliases are rejected by CHECK.
--   * Legacy BDL-* rows are remapped to XX-NNNN-NNNN-ish intermediates, then
--     REPLACED by the first production batch (005) — 004 deletes any
--     interim XX-NNNN-NNNN rows that are not the final first-batch shapes,
--     so the batch CHECK never sees a stale row.

-- 1. Drop legacy constraints
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_batch_check;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_check;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_check1;
ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_alias_check;
ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_check;

-- 2. Alias kind column
ALTER TABLE batch_aliases ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'manufacturer'
  CHECK (kind IN ('manufacturer', 'label'));

-- 3. Remove legacy rows. The alias/coa/report/lookup FKs block PK deletes,
-- so drop FKs, delete legacy demo rows, re-add FKs, then enforce new CHECKs.
-- Legacy BDL-* rows are demo data only — the real first production batch
-- lands in 005 on the final XX-NNNN-XXNN standard.
ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_batch_fkey;
ALTER TABLE coa_rows DROP CONSTRAINT IF EXISTS coa_rows_batch_fkey;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_batch_canonical_fkey;
ALTER TABLE lookups DROP CONSTRAINT IF EXISTS lookups_batch_canonical_fkey;

DELETE FROM batch_aliases WHERE batch LIKE 'BDL-%' OR batch NOT IN (SELECT batch FROM batches);
DELETE FROM coa_rows WHERE batch LIKE 'BDL-%';
UPDATE reports SET batch_canonical = NULL WHERE batch_canonical LIKE 'BDL-%';
UPDATE lookups SET batch_canonical = NULL WHERE batch_canonical LIKE 'BDL-%';
DELETE FROM batches WHERE batch LIKE 'BDL-%';

-- 4. Also clear any stale old-shape rows from earlier replays of this file
-- (shapes that are canonical under the retired interim standard but NOT
-- under XX-NNNN-XXNN) so the new CHECK never sees them.
DELETE FROM batch_aliases WHERE batch !~ '^[A-Z0-9]{2}-[0-9]{4}-[A-Z0-9]{2}[0-9]{2}$';
DELETE FROM coa_rows WHERE batch !~ '^[A-Z0-9]{2}-[0-9]{4}-[A-Z0-9]{2}[0-9]{2}$';
UPDATE reports SET batch_canonical = NULL WHERE batch_canonical !~ '^[A-Z0-9]{2}-[0-9]{4}-[A-Z0-9]{2}[0-9]{2}$';
UPDATE lookups SET batch_canonical = NULL WHERE batch_canonical !~ '^[A-Z0-9]{2}-[0-9]{4}-[A-Z0-9]{2}[0-9]{2}$';
DELETE FROM batches WHERE batch !~ '^[A-Z0-9]{2}-[0-9]{4}-[A-Z0-9]{2}[0-9]{2}$';

-- Re-add FKs
ALTER TABLE batch_aliases ADD CONSTRAINT batch_aliases_batch_fkey
  FOREIGN KEY (batch) REFERENCES batches(batch) ON DELETE CASCADE;
ALTER TABLE coa_rows ADD CONSTRAINT coa_rows_batch_fkey
  FOREIGN KEY (batch) REFERENCES batches(batch) ON DELETE CASCADE;
ALTER TABLE reports ADD CONSTRAINT reports_batch_canonical_fkey
  FOREIGN KEY (batch_canonical) REFERENCES batches(batch) ON DELETE SET NULL;
ALTER TABLE lookups ADD CONSTRAINT lookups_batch_canonical_fkey
  FOREIGN KEY (batch_canonical) REFERENCES batches(batch) ON DELETE SET NULL;

-- Canonical seed rows for the new standard (replay-safe upserts; no deletes,
-- so test-created FK rows never block the replay).
-- Shapes are XX-NNNN-XXNN (final first-batch shapes) — e.g. FR-2509-FR12.
-- The XXNN serial echoes the product code so every code stays readable and
-- unique; 005 adds the real first production batch on top.
INSERT INTO batches (batch, product_code, manufactured, expires, facility, lab, status, recall_reason, first_checked_at) VALUES
('FR-2509-FR12', 'FR', '2025-09-14', '2027-09-13', 'Unit 2, Baddi, Himachal Pradesh', 'Eurofins Analytical Services India, Bengaluru', 'released', NULL, '2025-10-01T09:00:00Z'),
('CN-2510-CN80', 'CN', '2025-10-02', '2027-04-01', 'Unit 1, Baddi, Himachal Pradesh', 'Eurofins Analytical Services India, Bengaluru', 'released', NULL, '2025-10-01T09:00:00Z'),
('MB-2203-MB45', 'MB', '2022-03-08', '2024-03-07', 'Unit 2, Baddi, Himachal Pradesh', 'TÜV SÜD South Asia, Chennai', 'released', NULL, '2025-10-01T09:00:00Z'),
('PH-2504-PH77', 'PH', '2025-04-21', '2027-04-20', 'Unit 2, Baddi, Himachal Pradesh', 'TÜV SÜD South Asia, Chennai', 'recalled', 'Voluntary recall: a labelling error lists the wrong serving size. The capsules themselves meet specification.', '2025-05-10T09:00:00Z'),
('FN-2501-FN01', 'FN', '2025-01-10', '2027-01-09', 'Unit 1, Baddi, Himachal Pradesh', 'Eurofins Analytical Services India, Bengaluru', 'released', NULL, NULL)
ON CONFLICT (batch) DO UPDATE SET product_code=EXCLUDED.product_code, manufactured=EXCLUDED.manufactured,
    expires=EXCLUDED.expires, facility=EXCLUDED.facility, lab=EXCLUDED.lab, status=EXCLUDED.status,
    recall_reason=EXCLUDED.recall_reason, updated_at=NOW();

-- Mapped manufacturer + label codes (idempotent)
INSERT INTO batch_aliases (alias, compact_key, batch, kind, created_by) VALUES
('MFG-FR-12090312', 'MFGFR12090312', 'FR-2509-FR12', 'manufacturer', 'seed'),
('LBL-FR-0312', 'LBLFR0312', 'FR-2509-FR12', 'label', 'seed'),
('FR2509FR12', 'FR2509FR12', 'FR-2509-FR12', 'manufacturer', 'seed'),
('MFG-CN-25101180', 'MFGCN25101180', 'CN-2510-CN80', 'manufacturer', 'seed'),
('LBL-CN-1180', 'LBLCN1180', 'CN-2510-CN80', 'label', 'seed'),
('MFG-PH-25040777', 'MFGPH25040777', 'PH-2504-PH77', 'manufacturer', 'seed')
ON CONFLICT (alias) DO UPDATE SET batch=EXCLUDED.batch, compact_key=EXCLUDED.compact_key, kind=EXCLUDED.kind;

-- 5. Enforce the new standard AFTER data is clean
-- UIBatch standard XX-NNNN-XXNN (spaces stripped/ignored):
--   XX   — 2 alphanumeric chars (A-Z, 0-9)
--   NNNN — 4 digits
--   XXNN — 2 alphanumerics + 2 digits (e.g. WL01)
-- Drop-first: 001b already dropped these on fresh chains, but replayed DBs
-- that ran an older 004 may still carry a same-named constraint — dropping
-- first keeps the file idempotent (ADD CONSTRAINT has no IF NOT EXISTS).
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_batch_check;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_product_check;
ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_alias_check;
ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_format_check;
ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_not_canonical_check;
ALTER TABLE batches ADD CONSTRAINT batches_batch_check
  CHECK (batch ~ '^[A-Z0-9]{2}-[0-9]{4}-[A-Z0-9]{2}[0-9]{2}$');
ALTER TABLE batches ADD CONSTRAINT batches_product_check
  CHECK (SUBSTRING(batch FROM 1 FOR 2) = product_code);
ALTER TABLE batch_aliases ADD CONSTRAINT batch_aliases_alias_check
  CHECK (char_length(alias) BETWEEN 3 AND 40);
ALTER TABLE batch_aliases ADD CONSTRAINT batch_aliases_format_check
  CHECK (alias ~ '^[A-Z0-9][A-Z0-9\-#]*[A-Z0-9]$');
ALTER TABLE batch_aliases ADD CONSTRAINT batch_aliases_not_canonical_check
  CHECK (alias !~ '^[A-Z0-9]{2}-[0-9]{4}-[A-Z0-9]{2}[0-9]{2}$');
