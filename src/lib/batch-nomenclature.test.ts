import { describe, expect, it } from 'vitest'
import { compactKey, isCanonicalBatch, normaliseAlias, normaliseBatch } from '../lib/utils'
import { BATCH_PATTERN, batchAliasSchema, batchLookupSchema, batchNumberSchema } from '../lib/schemas'

describe('batch nomenclature (batch.bodylia.in)', () => {
  it('keeps the canonical format strict: BDL-<CODE>-YYMM-NNNN', () => {
    expect(BATCH_PATTERN.test('BDL-FR-2509-0312')).toBe(true)
    expect(BATCH_PATTERN.test('BDL-CN-2510-1180')).toBe(true)
    expect(isCanonicalBatch('BDL-FR-2509-0312')).toBe(true)
    // Rejects vendor-style codes and malformed months
    expect(BATCH_PATTERN.test('FR-2509-312')).toBe(false)
    expect(BATCH_PATTERN.test('VND-FR-0312')).toBe(false)
    expect(BATCH_PATTERN.test('BDL-FR-2513-0312')).toBe(false)
    expect(BATCH_PATTERN.test('BDL-FR-2509-312')).toBe(false)
    expect(batchNumberSchema.safeParse('BDL-FR-2509-0312').success).toBe(true)
    expect(batchNumberSchema.safeParse('FR-2509-312').success).toBe(false)
  })

  it('normalises canonical input (spaces, case)', () => {
    expect(normaliseBatch('  bdl-fr 2509 0312 ')).toBe('BDL-FR-2509-0312')
  })

  it('normalises vendor aliases (slashes, underscores, dots, case)', () => {
    expect(normaliseAlias('bdl_fr/2509 0312')).toBe('BDL-FR-2509-0312')
    expect(normaliseAlias('  vnd_fr.0312 ')).toBe('VND-FR-0312')
    expect(normaliseAlias('FR25090312')).toBe('FR25090312')
  })

  it('matches compact keys ignoring punctuation', () => {
    expect(compactKey('FR-2509-312')).toBe(compactKey('FR25090312'.replace('FR25090312', 'FR-2509-312')))
    expect(compactKey('BDL-FR-2509-0312')).toBe('BDLFR25090312')
  })

  it('public lookup accepts canonical AND vendor codes', () => {
    expect(batchLookupSchema.safeParse('BDL-FR-2509-0312').success).toBe(true)
    expect(batchLookupSchema.safeParse('FR-2509-312').success).toBe(true)
    expect(batchLookupSchema.safeParse('VND-FR-0312').success).toBe(true)
    expect(batchLookupSchema.safeParse('FR25090312').success).toBe(true)
    expect(batchLookupSchema.safeParse('x').success).toBe(false)
  })

  it('alias schema rejects canonical numbers', () => {
    expect(batchAliasSchema.safeParse('FR-2509-312').success).toBe(true)
    expect(batchAliasSchema.safeParse('BDL-FR-2509-0312').success).toBe(false)
  })
})
