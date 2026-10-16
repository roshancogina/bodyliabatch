import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BATCHES } from '../data/mock-batches'
import { apiBase, lookupBatch, remoteLookup, resolveApiBase, resolveBatch, searchBatches, stubApiBaseForTests, submitReport, trackReport } from './bff'
import { createChallenge, solveChallenge } from './captcha'
import { store } from './store'
import { mockLookup, resetMockRateLimit } from './mock-bff'

const TEST_SECRET = 'test-captcha-secret-0123456789abcdef'
const testToken = () => solveChallenge(createChallenge(TEST_SECRET, { salt: 'u'.repeat(32) }), { difficulty: 1 }).token

beforeEach(() => {
  store.set(() => ({ batches: [...BATCHES] }))
  resetMockRateLimit()
  vi.unstubAllGlobals()
  vi.stubEnv('VITE_API_URL', '')
})

describe('UIBatch coverage edges (v8 branch mapping)', () => {
  it('resolves batches with NO aliases array (?? [] fallback)', () => {
    const noAliases = { batch: 'QQ-2601-WL01', product: 'QQ', manufactured: '2026-01-01', expires: '2028-01-01', lab: 'L', facility: 'F', status: 'released' as const, coa: [] }
    const extended = [...BATCHES, noAliases]
    expect(resolveBatch('QQ-2601-WL01', extended)?.record.batch).toBe('QQ-2601-WL01')
    expect(searchBatches('QQ-2601', extended).map((b) => b.batch)).toContain('QQ-2601-WL01')
  })

  it('matches hyphen-less stored batch only via compact key', () => {
    const flat = { batch: 'ZZ2601WL01', product: 'ZZ', manufactured: '2026-01-01', expires: '2028-01-01', lab: 'L', facility: 'F', status: 'released' as const, coa: [], aliases: [] }
    expect(resolveBatch('ZZ-2601-WL01', [...BATCHES, flat])?.record.batch).toBe('ZZ2601WL01')
  })

  it('remote submit/track pass explicit tokens verbatim', async () => {
    const base = 'http://127.0.0.1:8101'
    stubApiBaseForTests(base)
    const bodies: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ''))
        if (String(url).includes('/reports/track')) return { ok: true, status: 200, json: async () => ({ found: false }) } as Response
        return { ok: true, status: 200, json: async () => ({ reference: 'SR-2026-00002' }) } as Response
      }),
    )
    const payload = { fullName: 'Edge', email: 'edge@example.com', phone: '', batch: 'PE-2610-WL01', channel: 'Amazon' as const, message: 'Edge report with enough characters.', consent: true as const }
    await submitReport(payload, 'tok-edge')
    await trackReport('SR-2026-00002', 'edge@example.com', 'tok-edge')
    expect(JSON.parse(bodies[0]).captchaToken).toBe('tok-edge')
    expect(JSON.parse(bodies[1]).captchaToken).toBe('tok-edge')
    stubApiBaseForTests('')
  })

  it('mock lookupBatch stamps firstCheckedAt only once', async () => {
    store.set(() => ({
      batches: BATCHES.map((b) => (b.batch === 'PE-2610-WL01' ? { ...b, firstCheckedAt: undefined } : b)),
      settings: { ...store.get().settings, rateLimitPerMinute: 100 },
    }))
    await mockLookup('pe 2610 wl01')
    const first = store.get().batches.find((b) => b.batch === 'PE-2610-WL01')?.firstCheckedAt
    expect(first).toBeTruthy()
    await mockLookup('PE-2610-WL01')
    expect(store.get().batches.find((b) => b.batch === 'PE-2610-WL01')?.firstCheckedAt).toBe(first)
  })

  it('remote submit/track without token send empty captchaToken (?? fallback)', async () => {
    const base = 'http://127.0.0.1:8101'
    stubApiBaseForTests(base)
    const bodies: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ''))
        return { ok: true, status: 200, json: async () => ({ reference: 'SR-2026-00003', found: false }) } as Response
      }),
    )
    const payload = { fullName: 'Edge', email: 'edge@example.com', phone: '', batch: 'PE-2610-WL01', channel: 'Amazon' as const, message: 'Edge report with enough characters.', consent: true as const }
    await submitReport(payload)
    await trackReport('SR-2026-00003', 'edge@example.com')
    expect(JSON.parse(bodies[0]).captchaToken).toBe('')
    expect(JSON.parse(bodies[1]).captchaToken).toBe('')
    stubApiBaseForTests('')
  })

  it('resolveApiBase covers all four source combos + trailing slash', () => {
    expect(resolveApiBase('http://stub:8101/', { VITE_API_URL: 'http://env:8101' })).toBe('http://stub:8101')
    expect(resolveApiBase('http://stub:8101', undefined)).toBe('http://stub:8101')
    expect(resolveApiBase(undefined, { VITE_API_URL: 'http://env:8101/' })).toBe('http://env:8101')
    expect(resolveApiBase(undefined, undefined)).toBe('')
    expect(resolveApiBase(undefined, {})).toBe('')
    expect(resolveApiBase('', { VITE_API_URL: 'http://env:8101' })).toBe('')
  })

  it('apiBase falls back to empty string with no stub and no env', () => {
    vi.unstubAllGlobals()
    vi.stubEnv('VITE_API_URL', undefined as unknown as string)
    expect(apiBase()).toBe('')
    vi.stubEnv('VITE_API_URL', '')
  })

  it('remoteLookup maps a thrown 404-status error to not_found', async () => {
    const err = Object.assign(new Error('gone'), { status: 404 })
    vi.stubGlobal('fetch', vi.fn(async () => { throw err }))
    expect((await remoteLookup('PE-2610-WL01')).kind).toBe('not_found')
  })
})
