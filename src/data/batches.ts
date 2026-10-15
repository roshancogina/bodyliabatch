import type { ProductCode } from './products'
import { assertMockAllowed } from '../lib/runtime-env'

export interface CoaRow {
  test: string
  specification: string
  result: string
  pass: boolean
}

export interface BatchRecord {
  batch: string
  product: ProductCode
  manufactured: string // ISO date
  expires: string // ISO date
  lab: string
  facility: string
  status: 'released' | 'recalled'
  recallReason?: string
  coa: CoaRow[]
  /** Set on the first public check. Edits after this need a recorded reason. */
  firstCheckedAt?: string
  coaFileName?: string
  /**
   * Vendor-printed aliases for this canonical batch.
   * Canonical `batch` is ALWAYS BDL-<CODE>-YYMM-NNNN.
   * Vendors print different lot formats — each alias below resolves to
   * this canonical record for public verify + admin search.
   * Stored normalised via normaliseAlias() (uppercase, hyphen-collapsed).
   */
  aliases?: string[]
}

/**
 * MOCK FIXTURE — dev/test only. Production builds throw on import.
 * Canonical source is Postgres (backend-go/migrations/002_*); this mirrors
 * it so the in-memory BFF and vitest run without a database.
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
  return [
    {
      batch: 'BDL-FR-2509-0312',
      product: 'FR',
      manufactured: '2025-09-14',
      expires: '2027-09-13',
      lab: 'Eurofins Analytical Services India, Bengaluru',
      facility: 'Unit 2, Baddi, Himachal Pradesh',
      status: 'released',
      firstCheckedAt: '2025-10-01T09:00:00Z',
      coa: standardCoa('Iron (bisglycinate) 18 mg ± 10 %', '18.4 mg'),
      // Example vendor aliases: different printers / contract lots mapping to one canonical batch.
      aliases: ['FR-2509-312', 'VND-FR-0312', 'FR25090312'],
    },
    {
      batch: 'BDL-CN-2510-1180',
      product: 'CN',
      manufactured: '2025-10-02',
      expires: '2027-04-01',
      lab: 'Eurofins Analytical Services India, Bengaluru',
      facility: 'Unit 1, Baddi, Himachal Pradesh',
      status: 'released',
      firstCheckedAt: '2025-10-01T09:00:00Z',
      coa: standardCoa('Cranberry PAC 36 mg ± 10 %', '37.1 mg'),
      aliases: ['CN-2510-1180', 'VND-CN-1180'],
    },
    {
      batch: 'BDL-MB-2203-0045',
      product: 'MB',
      manufactured: '2022-03-08',
      expires: '2024-03-07',
      lab: 'TÜV SÜD South Asia, Chennai',
      facility: 'Unit 2, Baddi, Himachal Pradesh',
      status: 'released',
      firstCheckedAt: '2025-10-01T09:00:00Z',
      coa: standardCoa('Myo-inositol 500 mg ± 10 %', '508 mg'),
      aliases: [],
    },
    {
      batch: 'BDL-PH-2504-0777',
      product: 'PH',
      manufactured: '2025-04-21',
      expires: '2027-04-20',
      lab: 'TÜV SÜD South Asia, Chennai',
      facility: 'Unit 2, Baddi, Himachal Pradesh',
      status: 'recalled',
      firstCheckedAt: '2025-05-10T09:00:00Z',
      recallReason:
        'Voluntary recall: a labelling error lists the wrong serving size. The capsules themselves meet specification.',
      coa: standardCoa('Ashwagandha withanolides 15 mg ± 10 %', '15.6 mg'),
      aliases: ['PH25040777'],
    },
  ]
}

export const BATCHES: BatchRecord[] = buildMockBatches()

/** Mock-only sample list for the dev preview form. Hidden in production builds. */
export const DEMO_BATCHES = (() => {
  assertMockAllowed('mock DEMO_BATCHES fixture')
  return [
    { batch: 'BDL-FR-2509-0312', label: 'Genuine' },
    { batch: 'FR-2509-312', label: 'Genuine via vendor alias' },
    { batch: 'BDL-MB-2203-0045', label: 'Expired' },
    { batch: 'BDL-PH-2504-0777', label: 'Recalled' },
    { batch: 'BDL-FN-2501-0001', label: 'Not found' },
  ]
})()

