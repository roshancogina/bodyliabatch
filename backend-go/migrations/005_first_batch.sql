-- Migration: 005 — First production batch (NOV 2026 → APR 2028).
-- Canonical: XX-NNNN-XXNN (spaces stripped/ignored).
--   XX   — 2 alphanumeric chars (A–Z, 0–9), e.g. PE
--   NNNN — 4 digits, e.g. 2610
--   XXNN — 2 alphanumerics + 2 digits, e.g. WL01
-- e.g. PE-2610-WL01. qty + mrp per batch; manufacturer codes mapped.
--
-- | Product Name | Type    | Our Batch No | Manufacturer Batch No | Qty  | MFG Date | MRP  | EXP Date |
-- | PERIHARMON   | CAPSULE | PE-2610-WL01 | 2K26001               | 1000 | NOV 2026 | 1399 | APR 2028 |
-- | FERRIMUNE    | CAPSULE | FE-2610-WL01 | 2K26002               | 1000 | NOV 2026 | 1199 | APR 2028 |
-- | FERTILINOVA  | CAPSULE | FN-2610-WL01 | 2K26003               | 1000 | NOV 2026 | 1499 | APR 2028 |
-- | MATERNABLOOM | CAPSULE | MB-2610-WL01 | 2K26004               | 1000 | NOV 2026 | 1399 | APR 2028 |
-- | CINDORIA     | SACHET  | CI-2610-WL01 | 2K26005               | 1000 | NOV 2026 | 1899 | APR 2028 |
--
-- Replay-safe: upserts only, no deletes (test-created FK rows never block).

-- 1. qty + mrp columns (pack facts shown on the result page)
ALTER TABLE batches ADD COLUMN IF NOT EXISTS qty INTEGER CHECK (qty IS NULL OR qty > 0);
ALTER TABLE batches ADD COLUMN IF NOT EXISTS mrp NUMERIC(10,2) CHECK (mrp IS NULL OR mrp >= 0);

-- 2. Products for the first batch (PE/FE/FN/MB/CI; keep any existing rows)
INSERT INTO products (code, name, claim, format, image_url, shelf_life_months) VALUES
('PE', 'PeriHarmon', 'Complete hormonal, metabolic & adaptogenic support', 'CAPSULE · 1000 units', 'https://cdn.magicpatterns.com/uploads/2JSsTRonWoayLZt672W9PR/transparent-PeriHarmon.png', 18),
('FE', 'FerriMune', 'Advanced iron absorption & immune defense formula', 'CAPSULE · 1000 units', 'https://cdn.magicpatterns.com/uploads/aCzupDzefqtcCmrHxir5C5/transparent-Ferrimune.png', 18),
('FN', 'FertiliNova', 'Premium fertility & reproductive health support', 'CAPSULE · 1000 units', 'https://cdn.magicpatterns.com/uploads/haHb8DefwJ4NrLgSuUshAy/transparent-FertiliNova.png', 18),
('MB', 'MaternaBloom', 'Systemic hormonal harmony & menstrual cycle balance', 'CAPSULE · 1000 units', 'https://cdn.magicpatterns.com/uploads/tMgHkvs3TM991yc9SkUbzi/transparent-MaternaBloom.png', 18),
('CI', 'Cindoria', 'Advanced botanical defence for urinary tract protection', 'SACHET · 1000 units', 'https://cdn.magicpatterns.com/uploads/x2QGN2QuRAtgYDHZVScVbT/cindoria-zip-lock-front-filled.png', 18)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, claim=EXCLUDED.claim, format=EXCLUDED.format,
    image_url=EXCLUDED.image_url, shelf_life_months=EXCLUDED.shelf_life_months, updated_at=NOW();

-- 3. Canonical first-batch rows (MFG NOV 2026, EXP APR 2028, qty 1000 each)
INSERT INTO batches (batch, product_code, manufactured, expires, facility, lab, status, qty, mrp, first_checked_at) VALUES
('PE-2610-WL01', 'PE', '2026-11-01', '2028-04-30', 'Unit 2, Baddi, Himachal Pradesh', 'Eurofins Analytical Services India, Bengaluru', 'released', 1000, 1399, '2026-11-15T09:00:00Z'),
('FE-2610-WL01', 'FE', '2026-11-01', '2028-04-30', 'Unit 1, Baddi, Himachal Pradesh', 'Eurofins Analytical Services India, Bengaluru', 'released', 1000, 1199, '2026-11-15T09:00:00Z'),
('FN-2610-WL01', 'FN', '2026-11-01', '2028-04-30', 'Unit 2, Baddi, Himachal Pradesh', 'Eurofins Analytical Services India, Bengaluru', 'released', 1000, 1499, '2026-11-15T09:00:00Z'),
('MB-2610-WL01', 'MB', '2026-11-01', '2028-04-30', 'Unit 2, Baddi, Himachal Pradesh', 'TÜV SÜD South Asia, Chennai', 'released', 1000, 1399, '2026-11-15T09:00:00Z'),
('CI-2610-WL01', 'CI', '2026-11-01', '2028-04-30', 'Unit 1, Baddi, Himachal Pradesh', 'TÜV SÜD South Asia, Chennai', 'released', 1000, 1899, '2026-11-15T09:00:00Z')
ON CONFLICT (batch) DO UPDATE SET product_code=EXCLUDED.product_code, manufactured=EXCLUDED.manufactured,
    expires=EXCLUDED.expires, facility=EXCLUDED.facility, lab=EXCLUDED.lab, status=EXCLUDED.status,
    qty=EXCLUDED.qty, mrp=EXCLUDED.mrp, updated_at=NOW();

-- 4. Manufacturer codes mapped to the canonical rows (idempotent)
INSERT INTO batch_aliases (alias, compact_key, batch, kind, created_by) VALUES
('2K26001', '2K26001', 'PE-2610-WL01', 'manufacturer', 'seed'),
('2K26002', '2K26002', 'FE-2610-WL01', 'manufacturer', 'seed'),
('2K26003', '2K26003', 'FN-2610-WL01', 'manufacturer', 'seed'),
('2K26004', '2K26004', 'MB-2610-WL01', 'manufacturer', 'seed'),
('2K26005', '2K26005', 'CI-2610-WL01', 'manufacturer', 'seed')
ON CONFLICT (alias) DO UPDATE SET batch=EXCLUDED.batch, compact_key=EXCLUDED.compact_key, kind=EXCLUDED.kind;

-- 5. Standard 7-test COA panel per first-batch row (idempotent: skip existing)
INSERT INTO coa_rows (batch, test, specification, result, pass, position)
SELECT b.batch, t.test, t.specification, t.result, TRUE, t.position
FROM (VALUES
  ('PE-2610-WL01'), ('FE-2610-WL01'), ('FN-2610-WL01'), ('MB-2610-WL01'), ('CI-2610-WL01')
) AS b(batch)
CROSS JOIN (VALUES
  ('Assay (active)', 'Label claim ± 10 %', 'Within specification', 0),
  ('Total plate count', '≤ 10,000 cfu/g', '1,200 cfu/g', 1),
  ('Yeast & mould', '≤ 100 cfu/g', '< 10 cfu/g', 2),
  ('E. coli', 'Absent in 10 g', 'Absent', 3),
  ('Lead (Pb)', '≤ 1.0 ppm', '0.12 ppm', 4),
  ('Arsenic (As)', '≤ 1.0 ppm', '0.08 ppm', 5),
  ('Moisture', '≤ 6.0 %', '3.4 %', 6)
) AS t(test, specification, result, position)
WHERE NOT EXISTS (
  SELECT 1 FROM coa_rows c WHERE c.batch = b.batch AND c.test = t.test
);
