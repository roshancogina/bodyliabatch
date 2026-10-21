import { describe, expect, it, vi, beforeEach } from 'vitest'
import { BATCHES } from '../data/mock-batches'
import { CaptchaError } from './bff'
import { mockLookup, mockSubmitReport, mockTrackReport, mockSearch, mockBatchList, resetMockRateLimit } from './mock-bff'
import { batchCoaUrl, fetchRecalls, stubApiBaseForTests } from './bff'
import { createChallenge, solveChallenge } from './captcha'
import { store } from './store'

const TEST_SECRET = 'test-captcha-secret-0123456789abcdef'
const testToken = () => solveChallenge(createChallenge(TEST_SECRET, { salt: 'm'.repeat(32) }), { difficulty: 1 }).token

beforeEach(() => {
  store.set(() => ({ batches: [...BATCHES] }))
  resetMockRateLimit()
  vi.unstubAllGlobals()
  vi.stubEnv('VITE_API_URL', '')
})

describe('mock BFF client (dev/test only)', () => {
  it('exposes the fixture list and search', () => {
    expect(mockBatchList().length).toBe(BATCHES.length)
    expect(mockSearch('2K26001').map((b) => b.batch)).toContain('PE-2610-WL01')
  })

  it('resolves genuine, expired, recalled, missing and error codes', async () => {
    const now = new Date('2027-06-01T00:00:00Z')
    expect((await mockLookup('PE-2610-WL01', now)).kind).toBe('genuine')
    expect((await mockLookup('2K26001', now)).kind).toBe('genuine')
    expect((await mockLookup('NOPE-123', now)).kind).toBe('not_found')
    expect((await mockLookup('PE-2610-9999', now)).kind).toBe('error')
    store.set((s) => ({
      batches: [
        ...s.batches,
        { ...s.batches[0], batch: 'MB-2203-EX01', product: 'MB', expires: '2020-01-01' },
        { ...s.batches[0], batch: 'PH-2504-RC01', product: 'PH', status: 'recalled', recallReason: 'Mock recall.' },
      ],
    }))
    expect((await mockLookup('MB-2203-EX01', now)).kind).toBe('expired')
    expect((await mockLookup('PH-2504-RC01', now)).kind).toBe('recalled')
  })

  it('rate-limits when the window is exhausted', async () => {
    store.set(() => ({ settings: { ...store.get().settings, rateLimitPerMinute: 0 } }))
    expect((await mockLookup('PE-2610-WL01')).kind).toBe('rate_limited')
    store.set(() => ({ settings: { ...store.get().settings, rateLimitPerMinute: 100 } }))
  })

  it('fetchRecalls degrades cleanly without/beyond the API', async () => {
    vi.stubEnv('VITE_API_URL', '')
    stubApiBaseForTests('')
    expect(await fetchRecalls()).toEqual([])
    stubApiBaseForTests('http://127.0.0.1:8101')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ batch: 'PH-2504-RC01' }] }) as Response))
    expect(await fetchRecalls()).toEqual([{ batch: 'PH-2504-RC01' }])
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    expect(await fetchRecalls()).toEqual([])
    stubApiBaseForTests('')
    vi.unstubAllGlobals()
  })

  it('submit/track round-trip through the mock store', async () => {
    const payload = {
      fullName: 'Mock Only', email: 'mock@example.com', phone: '',
      batch: 'PE-2610-WL01', channel: 'Amazon' as const,
      message: 'Mock-client round trip with enough characters.', consent: true as const,
    }
    await expect(mockSubmitReport(payload)).rejects.toBeInstanceOf(CaptchaError)
    const { reference } = await mockSubmitReport(payload, testToken())
    await expect(mockTrackReport(reference, 'mock@example.com')).rejects.toBeInstanceOf(CaptchaError)
    expect((await mockTrackReport(reference, 'mock@example.com', testToken())).found).toBe(true)
  })

  it('batchCoaUrl formats download URL with canonical and alias inputs', () => {
    expect(batchCoaUrl('PE 2610 WL01', 'https://batch.bodylia.in')).toBe('https://batch.bodylia.in/bff/v1/batches/PE-2610-WL01/coa')
    expect(batchCoaUrl('2K26001', 'https://batch.bodylia.in')).toBe('https://batch.bodylia.in/bff/v1/batches/2K26001/coa')
  })
})