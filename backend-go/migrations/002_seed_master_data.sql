-- Migration: 002 — Seed master data + demo batches (mirrors src/data/*)
-- Products: 6 catalogue entries (codes embedded in batch numbers)
INSERT INTO products (code, name, claim, format, image_url, shelf_life_months) VALUES
('CN', 'Cindoria', 'Advanced botanical defence for urinary tract protection', '30 sachets × 5 g · Cranberry', 'https://cdn.magicpatterns.com/uploads/x2QGN2QuRAtgYDHZVScVbT/cindoria-zip-lock-front-filled.png', 18),
('FR', 'Ferrimune', 'Advanced iron absorption & immune defense formula', '30 veg. HPMC capsules', 'https://cdn.magicpatterns.com/uploads/aCzupDzefqtcCmrHxir5C5/transparent-Ferrimune.png', 24),
('FN', 'FertiliNova', 'Premium fertility & reproductive health support', '30 veg. HPMC capsules', 'https://cdn.magicpatterns.com/uploads/haHb8DefwJ4NrLgSuUshAy/transparent-FertiliNova.png', 24),
('MB', 'MaternaBloom', 'Systemic hormonal harmony & menstrual cycle balance', '30 veg. HPMC capsules', 'https://cdn.magicpatterns.com/uploads/tMgHkvs3TM991yc9SkUbzi/transparent-MaternaBloom.png', 24),
('PH', 'PeriHarmon', 'Complete hormonal, metabolic & adaptogenic support', '30 veg. HPMC capsules', 'https://cdn.magicpatterns.com/uploads/2JSsTRonWoayLZt672W9PR/transparent-PeriHarmon.png', 24),
('PD', 'ProteoDiva', 'Micronutrient protein for strength, energy & hormonal balance', '200 g tub · Belgian chocolate', 'https://cdn.magicpatterns.com/uploads/2YNkPMGbXQU76PGSh8k3ah/transparent-proteodiva.png', 12)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, claim=EXCLUDED.claim, format=EXCLUDED.format,
    image_url=EXCLUDED.image_url, shelf_life_months=EXCLUDED.shelf_life_months, updated_at=NOW();

-- Sites: 2 facilities + 2 labs
INSERT INTO sites (kind, name, accreditation, accreditation_expires) VALUES
('facility', 'Unit 1, Baddi, Himachal Pradesh', 'GMP-HP-1187', '2027-06-30'),
('facility', 'Unit 2, Baddi, Himachal Pradesh', 'GMP-HP-2210', '2026-11-30'),
('lab', 'Eurofins Analytical Services India, Bengaluru', 'NABL TC-5527', '2027-03-31'),
('lab', 'TÜV SÜD South Asia, Chennai', 'NABL TC-6012', '2026-08-31')
ON CONFLICT (name) DO UPDATE SET accreditation=EXCLUDED.accreditation,
    accreditation_expires=EXCLUDED.accreditation_expires, updated_at=NOW();

-- Batches: 4 demo records (genuine / genuine / expired / recalled)
INSERT INTO batches (batch, product_code, manufactured, expires, facility, lab, status, recall_reason, first_checked_at) VALUES
('BDL-FR-2509-0312', 'FR', '2025-09-14', '2027-09-13', 'Unit 2, Baddi, Himachal Pradesh', 'Eurofins Analytical Services India, Bengaluru', 'released', NULL, '2025-10-01T09:00:00Z'),
('BDL-CN-2510-1180', 'CN', '2025-10-02', '2027-04-01', 'Unit 1, Baddi, Himachal Pradesh', 'Eurofins Analytical Services India, Bengaluru', 'released', NULL, '2025-10-01T09:00:00Z'),
('BDL-MB-2203-0045', 'MB', '2022-03-08', '2024-03-07', 'Unit 2, Baddi, Himachal Pradesh', 'TÜV SÜD South Asia, Chennai', 'released', NULL, '2025-10-01T09:00:00Z'),
('BDL-PH-2504-0777', 'PH', '2025-04-21', '2027-04-20', 'Unit 2, Baddi, Himachal Pradesh', 'TÜV SÜD South Asia, Chennai', 'recalled', 'Voluntary recall: a labelling error lists the wrong serving size. The capsules themselves meet specification.', '2025-05-10T09:00:00Z')
ON CONFLICT (batch) DO UPDATE SET product_code=EXCLUDED.product_code, manufactured=EXCLUDED.manufactured,
    expires=EXCLUDED.expires, facility=EXCLUDED.facility, lab=EXCLUDED.lab, status=EXCLUDED.status,
    recall_reason=EXCLUDED.recall_reason, first_checked_at=EXCLUDED.first_checked_at, updated_at=NOW();

-- Vendor aliases: different printed lot codes resolving to the same canonical batch
INSERT INTO batch_aliases (alias, compact_key, batch, created_by) VALUES
('FR-2509-312', 'FR2509312', 'BDL-FR-2509-0312', 'seed'),
('VND-FR-0312', 'VNDFR0312', 'BDL-FR-2509-0312', 'seed'),
('FR25090312', 'FR25090312', 'BDL-FR-2509-0312', 'seed'),
('CN-2510-1180', 'CN25101180', 'BDL-CN-2510-1180', 'seed'),
('VND-CN-1180', 'VNDCN1180', 'BDL-CN-2510-1180', 'seed'),
('PH25040777', 'PH25040777', 'BDL-PH-2504-0777', 'seed')
ON CONFLICT (alias) DO UPDATE SET batch=EXCLUDED.batch, compact_key=EXCLUDED.compact_key;
