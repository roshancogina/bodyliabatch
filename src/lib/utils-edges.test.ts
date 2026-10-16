import { describe, expect, it } from 'vitest'
import { canonicalBatchError, normaliseBatch } from './utils'

describe('utils coverage edges (hyphen normalisation)', () => {
  it('leading/trailing/double hyphens collapse before validation', () => {
    // '-2610-WL01' → '2610-WL01' → 2 parts → shape error
    expect(canonicalBatchError('-2610-WL01')).toContain('2 characters, a hyphen')
    // 'PE--WL01' → 'PE-WL01' → 2 parts → shape error
    expect(canonicalBatchError('PE--WL01')).toContain('2 characters, a hyphen')
    // 'PE-2610-' → 'PE-2610' → 2 parts → shape error
    expect(canonicalBatchError('PE-2610-')).toContain('2 characters, a hyphen')
    // normaliseBatch passthrough for non-compact input
    expect(normaliseBatch('PE-2610-')).toBe('PE-2610')
    // per-position errors echo the offending group verbatim
    expect(canonicalBatchError('1-2610-WL01')).toContain('“1”')
    expect(canonicalBatchError('PE-261-WL01')).toContain('“261”')
  })
})
