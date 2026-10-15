import { beforeEach, describe, expect, it } from 'vitest'
import { BATCHES } from '../data/batches'
import { resolveBatch, searchBatches } from './bff'
import { store } from './store'

beforeEach(() => {
  store.set(() => ({ batches: [...BATCHES] }))
})

describe('alias-aware batch resolution', () => {
  it('resolves exact canonical codes', () => {
    const r = resolveBatch('BDL-FR-2509-0312')
    expect(r?.record.batch).toBe('BDL-FR-2509-0312')
    expect(r?.matchedAlias).toBeUndefined()
  })

  it('resolves exact vendor aliases', () => {
    const r = resolveBatch('FR-2509-312')
    expect(r?.record.batch).toBe('BDL-FR-2509-0312')
    expect(r?.matchedAlias).toBe('FR-2509-312')
  })

  it('resolves case/space-insensitive vendor input', () => {
    expect(resolveBatch('  fr 2509 312 ')?.record.batch).toBe('BDL-FR-2509-0312')
    expect(resolveBatch('vnd-fr-0312')?.record.batch).toBe('BDL-FR-2509-0312')
  })

  it('resolves compact (punctuation-stripped) vendor codes', () => {
    expect(resolveBatch('FR25090312')?.record.batch).toBe('BDL-FR-2509-0312')
    expect(resolveBatch('PH25040777')?.record.batch).toBe('BDL-PH-2504-0777')
  })

  it('returns null for unknown codes', () => {
    expect(resolveBatch('BDL-FN-2501-0001')).toBeNull()
    expect(resolveBatch('NOPE-123')).toBeNull()
  })

  it('admin search finds by canonical, alias, or compact form', () => {
    expect(searchBatches('BDL-FR-2509-0312').map((b) => b.batch)).toContain('BDL-FR-2509-0312')
    expect(searchBatches('FR-2509-312').map((b) => b.batch)).toContain('BDL-FR-2509-0312')
    expect(searchBatches('fr2509312').map((b) => b.batch)).toContain('BDL-FR-2509-0312')
    expect(searchBatches('VND-CN').map((b) => b.batch)).toContain('BDL-CN-2510-1180')
    expect(searchBatches('zzz-no-match')).toHaveLength(0)
  })
})
