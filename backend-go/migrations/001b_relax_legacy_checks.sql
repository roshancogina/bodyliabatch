-- Migration: 001b — Relax legacy batch CHECKs before seeds (002/003).
-- 001 pins the retired BDL-<PRODUCT>-<YYMM>-<NNNN> shape:
--   batches_batch_check   ~ '^BDL-[A-Z]{2}-...$'
--   SUBSTRING(batch FROM 5 FOR 2) = product_code
-- but seeds 002/003 insert BDL rows while 004 remaps to XX-NNNN-XXNN and
-- 005 lands the first production batch. Without this normalizer a FRESH
-- deploy (db-reset.sh / CI / dry-run) fails at 002 with:
--   pq: new row for relation "batches" violates check constraint
--       "batches_batch_check"
-- 001 itself is NOT edited (immutable history — already applied on live DBs);
-- this runs right after it, drops both legacy constraints idempotently, and
-- lets 004 add the final XX-NNNN-XXNN CHECKs after data is clean.
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_batch_check;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_check;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_check1;
-- Product cross-check: legacy shape anchors on chars 5-6 (after "BDL-"),
-- final shape on chars 1-2. Neither holds during seeding, so drop any
-- variant and let 004 re-add the final one.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'batches'::regclass AND pg_get_constraintdef(oid) LIKE '%product_code%'
  LOOP
    EXECUTE format('ALTER TABLE batches DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

-- Sibling alias guard: 001 pins alias CHECKs under the legacy regex, but
-- seed 002 stores interim canonicals as aliases and 004 re-adds the final
-- canonical alias CHECKs after remap. Drop all 001 alias CHECK variants
-- explicitly (name + any historical suffix) so 004 never collides.
ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_alias_check;
ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_format_check;
ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_not_canonical_check;
ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_check;
ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS batch_aliases_check1;
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'batch_aliases'::regclass AND pg_get_constraintdef(oid) LIKE '%!~%'
  LOOP
    EXECUTE format('ALTER TABLE batch_aliases DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;
