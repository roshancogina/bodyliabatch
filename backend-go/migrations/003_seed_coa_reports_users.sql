-- Migration: 003 — COA rows, staff users, demo reports
-- COA: standard 7-test panel per batch
INSERT INTO coa_rows (batch, test, specification, result, pass, position) VALUES
('BDL-FR-2509-0312', 'Assay (active)', 'Iron (bisglycinate) 18 mg ± 10 %', '18.4 mg', TRUE, 0),
('BDL-FR-2509-0312', 'Total plate count', '≤ 10,000 cfu/g', '1,200 cfu/g', TRUE, 1),
('BDL-FR-2509-0312', 'Yeast & mould', '≤ 100 cfu/g', '< 10 cfu/g', TRUE, 2),
('BDL-FR-2509-0312', 'E. coli', 'Absent in 10 g', 'Absent', TRUE, 3),
('BDL-FR-2509-0312', 'Lead (Pb)', '≤ 1.0 ppm', '0.12 ppm', TRUE, 4),
('BDL-FR-2509-0312', 'Arsenic (As)', '≤ 1.0 ppm', '0.08 ppm', TRUE, 5),
('BDL-FR-2509-0312', 'Moisture', '≤ 6.0 %', '3.4 %', TRUE, 6),
('BDL-CN-2510-1180', 'Assay (active)', 'Cranberry PAC 36 mg ± 10 %', '37.1 mg', TRUE, 0),
('BDL-CN-2510-1180', 'Total plate count', '≤ 10,000 cfu/g', '1,200 cfu/g', TRUE, 1),
('BDL-CN-2510-1180', 'Yeast & mould', '≤ 100 cfu/g', '< 10 cfu/g', TRUE, 2),
('BDL-CN-2510-1180', 'E. coli', 'Absent in 10 g', 'Absent', TRUE, 3),
('BDL-CN-2510-1180', 'Lead (Pb)', '≤ 1.0 ppm', '0.12 ppm', TRUE, 4),
('BDL-CN-2510-1180', 'Arsenic (As)', '≤ 1.0 ppm', '0.08 ppm', TRUE, 5),
('BDL-CN-2510-1180', 'Moisture', '≤ 6.0 %', '3.4 %', TRUE, 6),
('BDL-MB-2203-0045', 'Assay (active)', 'Myo-inositol 500 mg ± 10 %', '508 mg', TRUE, 0),
('BDL-MB-2203-0045', 'Total plate count', '≤ 10,000 cfu/g', '1,200 cfu/g', TRUE, 1),
('BDL-MB-2203-0045', 'Yeast & mould', '≤ 100 cfu/g', '< 10 cfu/g', TRUE, 2),
('BDL-MB-2203-0045', 'E. coli', 'Absent in 10 g', 'Absent', TRUE, 3),
('BDL-MB-2203-0045', 'Lead (Pb)', '≤ 1.0 ppm', '0.12 ppm', TRUE, 4),
('BDL-MB-2203-0045', 'Arsenic (As)', '≤ 1.0 ppm', '0.08 ppm', TRUE, 5),
('BDL-MB-2203-0045', 'Moisture', '≤ 6.0 %', '3.4 %', TRUE, 6),
('BDL-PH-2504-0777', 'Assay (active)', 'Ashwagandha withanolides 15 mg ± 10 %', '15.6 mg', TRUE, 0),
('BDL-PH-2504-0777', 'Total plate count', '≤ 10,000 cfu/g', '1,200 cfu/g', TRUE, 1),
('BDL-PH-2504-0777', 'Yeast & mould', '≤ 100 cfu/g', '< 10 cfu/g', TRUE, 2),
('BDL-PH-2504-0777', 'E. coli', 'Absent in 10 g', 'Absent', TRUE, 3),
('BDL-PH-2504-0777', 'Lead (Pb)', '≤ 1.0 ppm', '0.12 ppm', TRUE, 4),
('BDL-PH-2504-0777', 'Arsenic (As)', '≤ 1.0 ppm', '0.08 ppm', TRUE, 5),
('BDL-PH-2504-0777', 'Moisture', '≤ 6.0 %', '3.4 %', TRUE, 6)
ON CONFLICT DO NOTHING;

-- Staff users (preview password Bodylia@2026 for all; TOTP 246810 handled app-side)
INSERT INTO staff_users (name, email, password_hash, role, status, mfa) VALUES
('Meera Iyer', 'admin@bodylia.in', '$2a$10$g9L6AOHRVQj8xl6Ubf8mIORPo84ZpRNGQ0./lMw7jXMNyNnlnQPyK', 'admin', 'active', TRUE),
('Rohan Desai', 'qa@bodylia.in', '$2a$10$g9L6AOHRVQj8xl6Ubf8mIORPo84ZpRNGQ0./lMw7jXMNyNnlnQPyK', 'quality', 'active', TRUE),
('Ananya Sen', 'support@bodylia.in', '$2a$10$g9L6AOHRVQj8xl6Ubf8mIORPo84ZpRNGQ0./lMw7jXMNyNnlnQPyK', 'support', 'active', TRUE),
('Vikram Rao', 'vikram.r@bodylia.in', '$2a$10$g9L6AOHRVQj8xl6Ubf8mIORPo84ZpRNGQ0./lMw7jXMNyNnlnQPyK', 'support', 'active', TRUE),
('Kabir Malhotra', 'kabir.m@bodylia.in', '$2a$10$g9L6AOHRVQj8xl6Ubf8mIORPo84ZpRNGQ0./lMw7jXMNyNnlnQPyK', 'quality', 'invited', FALSE),
('Farah Khan', 'farah.k@bodylia.in', '$2a$10$g9L6AOHRVQj8xl6Ubf8mIORPo84ZpRNGQ0./lMw7jXMNyNnlnQPyK', 'support', 'deactivated', TRUE)
ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, password_hash=EXCLUDED.password_hash,
    role=EXCLUDED.role, status=EXCLUDED.status, mfa=EXCLUDED.mfa;

-- Demo reports + timelines (mirrors src/data/admin-seed.ts)
INSERT INTO reports (reference, full_name, email, phone, batch_input, batch_canonical, channel, message, photo_name, status, assignee) VALUES
('SR-2026-04821', 'Asha Rao', 'asha.rao@example.com', '98450 12345', 'BDL-FN-2501-0001', NULL, 'Flipkart', 'Batch number is not recognised on your site. The label print looks blurry and the seal was loose.', 'fertilinova-label.jpg', 'new', NULL),
('SR-2026-04817', 'Nisha Verma', 'nisha.v@example.com', NULL, 'BDL-FN-2501-0001', NULL, 'Flipkart', 'Bought from WellnessKart on Flipkart. Capsules smell odd and the bottle has no foil seal under the cap.', NULL, 'investigating', 'Ananya Sen'),
('SR-2026-04790', 'Priya Nair', 'priya.n@example.com', NULL, 'BDL-FR-2509-0312', 'BDL-FR-2509-0312', 'Pharmacy or store', 'Capsule colour looks darker than my previous pack of Ferrimune. Want to be sure it is safe.', NULL, 'new', NULL),
('SR-2026-04712', 'Divya Menon', 'divya.m@example.com', NULL, 'BDL-PH-2504-0777', 'BDL-PH-2504-0777', 'bodylia.in', 'Got a recall message when checking my PeriHarmon pack. How do I get a replacement?', NULL, 'investigating', 'Vikram Rao')
ON CONFLICT (reference) DO UPDATE SET full_name=EXCLUDED.full_name, email=EXCLUDED.email,
    batch_input=EXCLUDED.batch_input, batch_canonical=EXCLUDED.batch_canonical, status=EXCLUDED.status;

INSERT INTO report_timeline (reference, by, kind, text) VALUES
('SR-2026-04821', 'Customer', 'received', 'Report received via batch.bodylia.in'),
('SR-2026-04817', 'Customer', 'received', 'Report received via batch.bodylia.in'),
('SR-2026-04817', 'Ananya Sen', 'assign', 'Assigned to Ananya Sen'),
('SR-2026-04817', 'Ananya Sen', 'escalation', 'Escalated to quality (urgent)'),
('SR-2026-04790', 'Customer', 'received', 'Report received via batch.bodylia.in'),
('SR-2026-04712', 'Customer', 'received', 'Report received via batch.bodylia.in'),
('SR-2026-04712', 'Vikram Rao', 'assign', 'Assigned to Vikram Rao'),
('SR-2026-04712', 'Vikram Rao', 'note', 'Replacement order raised, awaiting courier pickup of the recalled pack.')
ON CONFLICT DO NOTHING;

INSERT INTO escalations (reference, by, reason, urgency, state) VALUES
('SR-2026-04817', 'Ananya Sen', 'Second report on the same unregistered batch from the same seller in 24 hours. Possible counterfeit cluster.', 'urgent', 'open')
ON CONFLICT (reference) DO UPDATE SET reason=EXCLUDED.reason, urgency=EXCLUDED.urgency, state=EXCLUDED.state;

