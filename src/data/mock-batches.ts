import type { BatchRecord, CoaRow } from './batches'
import { assertMockAllowed } from '../lib/runtime-env'

/**
 * MOCK batch fixtures — dev/test only. Production builds throw on import.
 * Canonical source is Postgres (backend-go/migrations/002_* + 005_first_batch);
 * this mirrors it so the in-memory BFF and vitest run without a database.
 * data/batches.ts intentionally holds NO fixture rows (WSOD fix, Oct 2026).
 */
function buildMockBatches(): BatchRecord[] {
  assertMockAllowed('mock BATCHES fixture')
  const standardCoa = (assay: string, result: string): CoaRow[] => [
    { test: 'Assay (active)', specification: assay, result, pass: true },
    { test: 'Total plate count', specification: '≤ 10,000 cfu/g', result: '1,200 cfu/g', pass: true },
    { test: 'Yeast & mould', specification: '≤ 100 cfu/g', result: '< 10 cfu/g', pass: true },
    { test: 'E. coli', specification: 'Absent in 10 g', result: 'Absent', pass: true },
    { test: 'Lead (Pb)', specification: '≤ 1.0 ppm', result: '0.12 ppm', pass: true },
    { test: 'Arsenic (As)', specification: '≤ 1.0 ppm', result: '0.08 ppm', pass: true },
    { test: 'Moisture', specification: '≤ 6.0 %', result: '3.4 %', pass: true },
  ]
  // First production batch (NOV 2026 → APR 2028), manufacturer codes mapped.
  // Canonical: XX-NNNN-XXNN. MFG Date NOV 2026, EXP APR 2028, qty 1000 each.
  return [
    {
      batch: 'PE-2610-WL01',
      product: 'PE',
      manufactured: '2026-11-01',
      expires: '2028-04-30',
      lab: 'Eurofins Analytical Services India, Bengaluru',
      facility: 'Unit 2, Baddi, Himachal Pradesh',
      status: 'released',
      qty: 1000,
      mrp: 1399,
      firstCheckedAt: '2026-11-15T09:00:00Z',
      coa: standardCoa('PeriHarmon blend 500 mg ± 10 %', '508 mg'),
      aliases: [{ code: '2K26001', kind: 'manufacturer' }],
    },
    {
      batch: 'FE-2610-WL01',
      product: 'FE',
      manufactured: '2026-11-01',
      expires: '2028-04-30',
      lab: 'Eurofins Analytical Services India, Bengaluru',
      facility: 'Unit 1, Baddi, Himachal Pradesh',
      status: 'released',
      qty: 1000,
      mrp: 1199,
      firstCheckedAt: '2026-11-15T09:00:00Z',
      coa: standardCoa('Iron (bisglycinate) 18 mg ± 10 %', '18.4 mg'),
      aliases: [{ code: '2K26002', kind: 'manufacturer' }],
    },
    {
      batch: 'FN-2610-WL01',
      product: 'FN',
      manufactured: '2026-11-01',
      expires: '2028-04-30',
      lab: 'Eurofins Analytical Services India, Bengaluru',
      facility: 'Unit 2, Baddi, Himachal Pradesh',
      status: 'released',
      qty: 1000,
      mrp: 1499,
      firstCheckedAt: '2026-11-15T09:00:00Z',
      coa: standardCoa('FertiliNova blend 500 mg ± 10 %', '506 mg'),
      aliases: [{ code: '2K26003', kind: 'manufacturer' }],
    },
    {
      batch: 'MB-2610-WL01',
      product: 'MB',
      manufactured: '2026-11-01',
      expires: '2028-04-30',
      lab: 'TÜV SÜD South Asia, Chennai',
      facility: 'Unit 2, Baddi, Himachal Pradesh',
      status: 'released',
      qty: 1000,
      mrp: 1399,
      firstCheckedAt: '2026-11-15T09:00:00Z',
      coa: standardCoa('Myo-inositol 500 mg ± 10 %', '508 mg'),
      aliases: [{ code: '2K26004', kind: 'manufacturer' }],
    },
    {
      batch: 'CI-2610-WL01',
      product: 'CI',
      manufactured: '2026-11-01',
      expires: '2028-04-30',
      lab: 'TÜV SÜD South Asia, Chennai',
      facility: 'Unit 1, Baddi, Himachal Pradesh',
      status: 'released',
      qty: 1000,
      mrp: 1899,
      firstCheckedAt: '2026-11-15T09:00:00Z',
      coa: standardCoa('Cranberry PAC 36 mg ± 10 %', '37.1 mg'),
      aliases: [{ code: '2K26005', kind: 'manufacturer' }],
    },
  ]
}

export const BATCHES: BatchRecord[] = buildMockBatches()

/** Mock-only sample list for the dev preview form. Hidden in production builds. */
export const DEMO_BATCHES = (() => {
  assertMockAllowed('mock DEMO_BATCHES fixture')
  return [
    { batch: 'PE-2610-WL01', label: 'Genuine' },
    { batch: '2K26001', label: 'Genuine via manufacturer code' },
    { batch: 'FE-2610-WL01', label: 'Genuine' },
    { batch: 'FN-2610-WL01', label: 'Genuine' },
    { batch: 'ZZ-9999-9Z99', label: 'Not found' },
  ]
})()

