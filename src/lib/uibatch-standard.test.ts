import { describe, expect, it } from 'vitest'
import {
  canonicalBatchError,
  cn,
  compactKey,
  isCanonicalBatch,
  normaliseAlias,
  normaliseBatch,
  parseCanonicalBatch,
  stripSpaces,
  UIBATCH_PATTERN,
} from './utils'
import {
  ALIAS_KINDS,
  BATCH_PATTERN,
  batchAliasSchema,
  batchLookupSchema,
  batchNumberSchema,
  canonicalBatchInputSchema,
  feedbackSchema,
  reportSchema,
  trackSchema,
} from './schemas'

/**
 * UIBatch canonical standard: XX-NNNN-XXNN.
 *   XX   — 2 alphanumeric chars (A–Z, 0–9), e.g. PE
 *   NNNN — 4 digits, e.g. 2610
 *   XXNN — 2 alphanumeric + 2 digits, e.g. WL01
 * Full example: PE-2610-WL01.
 */
describe('UIBatch canonical standard XX-NNNN-XXNN', () => {
  it('accepts well-formed codes', () => {
    const good = ['PE-2610-WL01', 'FE-2610-WL01', 'FN-2610-WL01', 'AB-0000-CD00', 'ZZ-9999-ZZ99', '12-2610-WL01']
    for (const g of good) {
      expect(UIBATCH_PATTERN.test(g), g).toBe(true)
      expect(BATCH_PATTERN.test(g), g).toBe(true)
      expect(isCanonicalBatch(g), g).toBe(true)
    }
  })

  it('rejects every malformed shape', () => {
    const bad: [string, string][] = [
      ['F-2610-WL01', 'single-char prefix'],
      ['PE-261-WL01', '3-digit middle'],
      ['PE-2610-WL0', '3-char serial'],
      ['PE-26100-WL01', '5-digit middle'],
      ['PE2610WL01', 'missing hyphens (raw)'],
      ['PE--2610--WL01', 'double hyphens'],
      ['-PE-2610-WL01', 'leading hyphen'],
      ['PE-2610-WL01-', 'trailing hyphen'],
      ['PE-261A-WL01', 'letter in middle'],
      ['PE-2610-WL0B', 'letter where final digits required'],
      ['PE-2610-01WL', 'digits-first serial'],
      ['PE-2610-WL01-X', 'fourth group'],
      ['PE-2610', 'two groups only'],
      ['', 'empty'],
      ['   ', 'spaces only'],
      ['BDL-PE-2610-WL01', 'legacy BDL- prefix'],
      ['PE-2610-WL01!', 'special char'],
    ]
    for (const [input, why] of bad) {
      expect(UIBATCH_PATTERN.test(input), why).toBe(false)
      expect(isCanonicalBatch(input), why).toBe(false)
    }
    // Legacy numeric serials (old XX-NNNN-NNNN, e.g. FR-2509-0312) remain
    // structurally valid under XX-NNNN-XXNN (03+12 = XXNN) — kept resolving.
    expect(UIBATCH_PATTERN.test('FR-2509-0312')).toBe(true)
  })

  it('ignores spaces anywhere', () => {
    expect(stripSpaces('pe 2610 wl01')).toBe('PE2610WL01')
    expect(stripSpaces('  PE - 2610 - WL01  ')).toBe('PE-2610-WL01')
    expect(stripSpaces('P E - 2 6 1 0 - W L 0 1')).toBe('PE-2610-WL01')
  })

  it('normaliseBatch auto-inserts hyphens for compact input', () => {
    expect(normaliseBatch('PE2610WL01')).toBe('PE-2610-WL01')
    expect(normaliseBatch('pe 2610 wl01')).toBe('PE-2610-WL01')
    expect(normaliseBatch('  pe-2610-wl01 ')).toBe('PE-2610-WL01')
    expect(normaliseBatch('PE--2610--WL01')).toBe('PE-2610-WL01')
  })

  it('parseCanonicalBatch splits prefix/mid/serial, null when invalid', () => {
    expect(parseCanonicalBatch('PE-2610-WL01')).toEqual({ prefix: 'PE', mid: '2610', serial: 'WL01' })
    expect(parseCanonicalBatch('pe2610wl01')).toEqual({ prefix: 'PE', mid: '2610', serial: 'WL01' })
    expect(parseCanonicalBatch('nope')).toBeNull()
  })
})

describe('UIBatch per-position errors', () => {
  it('explains exactly which group is wrong', () => {
    expect(canonicalBatchError('')).toBe('Enter the batch number printed on your pack.')
    expect(canonicalBatchError('   ')).toBe('Enter the batch number printed on your pack.')
    expect(canonicalBatchError('F-2610-WL01')).toContain('first 2 characters')
    expect(canonicalBatchError('PE-261-WL01')).toContain('middle 4 characters must be digits')
    expect(canonicalBatchError('PE-26A0-WL01')).toContain('middle 4 characters must be digits')
    expect(canonicalBatchError('PE-2610-WL0')).toContain('last 4 characters')
    expect(canonicalBatchError('PE-2610-WL0B')).toContain('last 4 characters')
    expect(canonicalBatchError('PE-2610-01WL')).toContain('last 4 characters')
    expect(canonicalBatchError('PE-2610')).toContain('2 characters, a hyphen, 4 digits, a hyphen')
    expect(canonicalBatchError('PE2610WL01!')).toContain('only use letters, digits, spaces and hyphens')
    expect(canonicalBatchError('PE-2610-WL01')).toBeNull()
  })
})

describe('UIBatch zod schemas', () => {
  it('strict schema accepts canonical, rejects with sensible message', () => {
    expect(batchNumberSchema.safeParse('PE-2610-WL01').success).toBe(true)
    expect(batchNumberSchema.safeParse('pe 2610 wl01').success).toBe(true)
    expect(batchNumberSchema.safeParse('PE2610WL01').success).toBe(true)
    const r2 = batchNumberSchema.safeParse('PE-261-WL01')
    expect(r2.success).toBe(false)
    if (!r2.success) expect(r2.error.issues[0].message).toContain('middle 4 characters must be digits')
    const r3 = batchNumberSchema.safeParse('')
    expect(r3.success).toBe(false)
    if (!r3.success) expect(r3.error.issues[0].message).toContain('Enter the batch number')
  })

  it('lookup schema accepts canonical and mapped codes', () => {
    expect(batchLookupSchema.safeParse('PE-2610-WL01').success).toBe(true)
    expect(batchLookupSchema.safeParse('pe 2610 wl01').success).toBe(true)
    expect(batchLookupSchema.safeParse('2K26001').success).toBe(true)
    expect(batchLookupSchema.safeParse('LBL-FE-0042').success).toBe(true)
    expect(batchLookupSchema.safeParse('x').success).toBe(false)
    expect(batchLookupSchema.safeParse('').success).toBe(false)
  })

  it('alias schema accepts mapped codes, rejects canonical', () => {
    expect(batchAliasSchema.safeParse('2K26001').success).toBe(true)
    expect(batchAliasSchema.safeParse('LBL-FE-0042').success).toBe(true)
    expect(Object.values(ALIAS_KINDS)).toEqual(['manufacturer', 'label'])
    const r = batchAliasSchema.safeParse('PE-2610-WL01')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toContain('already a canonical batch number')
  })

  it('report channel + consent errorMaps', () => {
    const base = { fullName: 'Jo Smith', email: 'a@b.in', batch: 'PE-2610-WL01', message: 'x'.repeat(25) }
    expect(reportSchema.safeParse({ ...base, channel: 'Mars', consent: true }).success).toBe(false)
    expect(reportSchema.safeParse({ ...base, channel: 'Amazon', consent: false }).success).toBe(false)
    expect(reportSchema.safeParse({ ...base, channel: 'Amazon', consent: true }).success).toBe(true)
  })

  it('track + feedback + lookup edge branches', () => {
    expect(trackSchema.safeParse({ reference: 'SR-2026-04821', email: 'a@b.in' }).success).toBe(true)
    expect(trackSchema.safeParse({ reference: 'bad', email: 'a@b.in' }).success).toBe(false)
    expect(trackSchema.safeParse({ reference: '', email: '' }).success).toBe(false)
    expect(feedbackSchema.safeParse({}).success).toBe(true)
    expect(feedbackSchema.safeParse({ comment: 'x'.repeat(501) }).success).toBe(false)
    expect(batchLookupSchema.safeParse('!!!').success).toBe(false)
    expect(batchLookupSchema.safeParse('x'.repeat(41)).success).toBe(false)
    expect(batchAliasSchema.safeParse('x'.repeat(41)).success).toBe(false)
    expect(batchAliasSchema.safeParse('!!!').success).toBe(false)
    expect(batchAliasSchema.safeParse('x').success).toBe(false)
    expect(batchNumberSchema.safeParse(123 as unknown as string).success).toBe(false)
    expect(batchLookupSchema.safeParse(123 as unknown as string).success).toBe(false)
    expect(canonicalBatchError(null as unknown as string)).toBe('Enter the batch number printed on your pack.')
  })

  it('utils cn + alias normalisation + facility site schema', async () => {
    expect(cn('a', 'b')).toBe('a b')
    expect(cn()).toBe('')
    expect(cn('a', false && 'b')).toBe('a')
    expect(canonicalBatchError('PE-2610-WL012')).toContain('last 4 characters')
    expect(canonicalBatchError('P!-2610-WL01')).toContain('only use letters, digits')
    expect(canonicalBatchError('PE-2610-!!!!')).toContain('only use letters, digits')
    expect(canonicalBatchError('-2610-WL01')).toContain('2 characters, a hyphen')
    expect(canonicalBatchError('PE--WL01')).toContain('2 characters, a hyphen')
    expect(canonicalBatchError('PE-2610-')).toContain('2 characters, a hyphen')
    expect(canonicalBatchError('1-2610-WL01')).toContain('first 2 characters')
    expect(canonicalBatchError('PE-261-WL0')).toContain('middle 4 characters must be digits')
    expect(normaliseAlias('  lbl fe 0042 ')).toBe('LBLFE0042')
    expect(normaliseAlias('mfg_fe/2610.wl01')).toBe('MFG-FE-2610-WL01')
    expect(compactKey('PE-2610-WL01')).toBe('PE2610WL01')
    expect(compactKey('pe 2610 wl01')).toBe('PE2610WL01')
    const m = await import('../admin/schemas')
    const ok = m.siteSchema('facility').safeParse({ name: 'Unit 1, Baddi', accreditation: 'GMP-1', accreditationExpires: '2999-01-01' })
    expect(ok.success).toBe(true)
  })

  it('report phone + photo refinements', () => {
    const base = { fullName: 'Jo Smith', email: 'a@b.in', batch: 'PE-2610-WL01', channel: 'Amazon' as const, message: 'x'.repeat(25), consent: true as const }
    expect(reportSchema.safeParse({ ...base, phone: '9876543210' }).success).toBe(true)
    expect(reportSchema.safeParse({ ...base, phone: '123' }).success).toBe(false)
    const badFile = { length: 1, 0: { type: 'text/plain', size: 10 } } as unknown as FileList
    expect(reportSchema.safeParse({ ...base, photo: badFile }).success).toBe(false)
    const bigFile = { length: 1, 0: { type: 'image/jpeg', size: 10 * 1024 * 1024 } } as unknown as FileList
    expect(reportSchema.safeParse({ ...base, photo: bigFile }).success).toBe(false)
  })

  it('canonicalBatchInputSchema length branches', () => {
    expect(canonicalBatchInputSchema.safeParse('PE-2610-WL01').success).toBe(true)
    expect(canonicalBatchInputSchema.safeParse('short').success).toBe(false)
    expect(canonicalBatchInputSchema.safeParse('x'.repeat(20)).success).toBe(false)
  })
})
