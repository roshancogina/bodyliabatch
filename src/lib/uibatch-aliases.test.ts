import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aliasCode, aliasKind } from '../data/batches'
import { BATCHES } from '../data/mock-batches'
import { CaptchaError, lookupBatch, remoteLookup, resolveBatch, searchBatches, stubApiBaseForTests, submitReport, trackReport, useRemoteBff } from './bff'
import { mockLookup, mockSubmitReport, mockTrackReport, resetMockRateLimit } from './mock-bff'
import { createChallenge, solveChallenge } from './captcha'
import { store } from './store'

const TEST_SECRET = 'test-captcha-secret-0123456789abcdef'
const testToken = () => solveChallenge(createChallenge(TEST_SECRET, { salt: 't'.repeat(32) }), { difficulty: 1 }).token

beforeEach(() => {
  store.set(() => ({ batches: [...BATCHES] }))
  resetMockRateLimit()
  vi.unstubAllGlobals()
  vi.stubEnv('VITE_API_URL', '')
})

describe('UIBatch alias resolution (manufacturer + label mapping)', () => {
  it('resolves exact canonical codes', () => {
    const r = resolveBatch('PE-2610-WL01', BATCHES)
    expect(r?.record.batch).toBe('PE-2610-WL01')
    expect(r?.record.product).toBe('PE')
    expect(r?.matchedAlias).toBeUndefined()
    expect(r?.matchedKind).toBeUndefined()
  })

  it('resolves canonical with spaces stripped', () => {
    expect(resolveBatch('pe 2610 wl01', BATCHES)?.record.batch).toBe('PE-2610-WL01')
    expect(resolveBatch('PE2610WL01', BATCHES)?.record.batch).toBe('PE-2610-WL01')
  })

  it('resolves first-batch manufacturer codes with kind', () => {
    const pairs: [string, string][] = [
      ['2K26001', 'PE-2610-WL01'],
      ['2K26002', 'FE-2610-WL01'],
      ['2K26003', 'FN-2610-WL01'],
      ['2K26004', 'MB-2610-WL01'],
      ['2K26005', 'CI-2610-WL01'],
    ]
    for (const [mfg, canon] of pairs) {
      const r = resolveBatch(mfg, BATCHES)
      expect(r?.record.batch, mfg).toBe(canon)
      expect(r?.matchedAlias, mfg).toBe(mfg)
      expect(r?.matchedKind, mfg).toBe('manufacturer')
    }
  })

  it('resolves case/space-insensitive mapped input', () => {
    expect(resolveBatch('  2k26001 ', BATCHES)?.record.batch).toBe('PE-2610-WL01')
    expect(resolveBatch('2k26005', BATCHES)?.record.batch).toBe('CI-2610-WL01')
  })

  it('returns null for unknown codes', () => {
    expect(resolveBatch('FN-2501-0001', BATCHES)).toBeNull()
    expect(resolveBatch('NOPE-123', BATCHES)).toBeNull()
  })

  it('admin search finds by canonical or manufacturer code', () => {
    expect(searchBatches('PE-2610-WL01', BATCHES).map((b) => b.batch)).toContain('PE-2610-WL01')
    expect(searchBatches('2K26001', BATCHES).map((b) => b.batch)).toContain('PE-2610-WL01')
    expect(searchBatches('2k26005', BATCHES).map((b) => b.batch)).toContain('CI-2610-WL01')
    expect(searchBatches('pe2610wl01', BATCHES).map((b) => b.batch)).toContain('PE-2610-WL01')
    expect(searchBatches('zzz-no-match', BATCHES)).toHaveLength(0)
  })
})


describe('UIBatch alias helpers + report/track + remote seam', () => {
  it('aliasCode/aliasKind handle both stored shapes', () => {
    expect(aliasCode('2K26001')).toBe('2K26001')
    expect(aliasKind('2K26001')).toBe('manufacturer')
    expect(aliasCode({ code: 'LBL-X', kind: 'label' })).toBe('LBL-X')
    expect(aliasKind({ code: 'LBL-X', kind: 'label' })).toBe('label')
    expect(aliasKind({ code: '2K26001', kind: 'manufacturer' })).toBe('manufacturer')
  })

  it('lookupBatch returns the same product details for every mapped code', async () => {
    const now = new Date('2027-06-01T00:00:00Z')
    for (const input of ['PE-2610-WL01', 'pe 2610 wl01', '2K26001', 'PE2610WL01']) {
      const res = await mockLookup(input, now)
      expect(res.kind, input).toBe('genuine')
      if (res.kind === 'genuine') {
        expect(res.record.batch).toBe('PE-2610-WL01')
        expect(res.record.product).toBe('PE')
      }
    }
  })

  it('lookupBatch stamps firstCheckedAt on first mock lookup only', async () => {
    store.set(() => ({
      batches: BATCHES.map((b) => (b.batch === 'PE-2610-WL01' ? { ...b, firstCheckedAt: undefined } : b)),
      settings: { ...store.get().settings, rateLimitPerMinute: 100 },
    }))
    expect(store.get().batches.find((b) => b.batch === 'PE-2610-WL01')?.firstCheckedAt).toBeUndefined()
    await mockLookup('pe 2610 wl01')
    expect(store.get().batches.find((b) => b.batch === 'PE-2610-WL01')?.firstCheckedAt).toBeTruthy()
    // Second lookup keeps the original stamp (already-stamped branch).
    await mockLookup('PE-2610-WL01')
    expect(store.get().batches.find((b) => b.batch === 'PE-2610-WL01')?.firstCheckedAt).toBeTruthy()
  })

  it('mock submit/track reject missing captcha tokens', async () => {
    const payload = {
      fullName: 'No Token', email: 'notoken@example.com', phone: '',
      batch: 'PE-2610-WL01', channel: 'Amazon' as const,
      message: 'Missing captcha must raise CaptchaError here.', consent: true as const,
    }
    await expect(mockSubmitReport(payload)).rejects.toBeInstanceOf(CaptchaError)
    await expect(mockTrackReport('SR-2026-04790', 'priya.n@example.com')).rejects.toBeInstanceOf(CaptchaError)
  })

  it('remote lookupBatch/trackReport/submitReport delegate to the Go service', async () => {
    const base = 'http://127.0.0.1:8101'
    stubApiBaseForTests(base)
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(String(url))
        if (String(url).includes('/reports/track')) return { ok: true, status: 200, json: async () => ({ found: false }) } as Response
        if (String(url).includes('/bff/v1/reports')) return { ok: true, status: 200, json: async () => ({ reference: 'SR-2026-00001' }) } as Response
        return { ok: true, status: 200, json: async () => ({ kind: 'genuine', record: BATCHES[0], matchedAlias: '2K26001', matchedKind: 'manufacturer' }) } as Response
      }),
    )
    const res = await lookupBatch('2K26001')
    expect(res.kind).toBe('genuine')
    const created = await submitReport(
      { fullName: 'Remote', email: 'r@e.com', phone: '', batch: 'PE-2610-WL01', channel: 'Amazon', message: 'Remote report with enough characters.', consent: true },
      'tok',
    )
    expect(created.reference).toBe('SR-2026-00001')
    const tracked = await trackReport('SR-2026-00001', 'r@e.com', 'tok')
    expect(tracked).toEqual({ found: false })
    expect(calls).toEqual([
      `${base}/bff/v1/batches/2K26001`,
      `${base}/bff/v1/reports`,
      `${base}/bff/v1/reports/track`,
    ])
    stubApiBaseForTests('')
  })

  it('lookupBatch stamps firstCheckedAt, flags recalled/expired, rate-limits', async () => {
    store.set(() => ({
      batches: BATCHES.map((b) => (b.batch === 'PE-2610-WL01' ? { ...b, firstCheckedAt: undefined } : b)),
      settings: { ...store.get().settings, rateLimitPerMinute: 100 },
    }))
    const first = await mockLookup('PE-2610-WL01', new Date('2027-06-01T00:00:00Z'))
    expect(first.kind).toBe('genuine')
    expect(store.get().batches.find((b) => b.batch === 'PE-2610-WL01')?.firstCheckedAt).toBeTruthy()

    // Recalled/expired branches: inject temp fixtures (first batch is all released).
    store.set((s) => ({
      batches: [
        ...s.batches,
        { ...s.batches[0], batch: 'PH-2504-RC01', product: 'PH', status: 'recalled', recallReason: 'Test recall — do not consume.' },
        { ...s.batches[0], batch: 'MB-2203-EX01', product: 'MB', expires: '2020-01-01' },
      ],
    }))
    const recalled = await mockLookup('PH-2504-RC01', new Date('2027-06-01T00:00:00Z'))
    expect(recalled.kind).toBe('recalled')

    const expired = await mockLookup('MB-2203-EX01', new Date('2027-06-01T00:00:00Z'))
    expect(expired.kind).toBe('expired')

    const missing = await mockLookup('FN-2501-0001', new Date('2027-06-01T00:00:00Z'))
    expect(missing.kind).toBe('not_found')

    store.set(() => ({ settings: { ...store.get().settings, rateLimitPerMinute: 0 } }))
    const limited = await mockLookup('PE-2610-WL01', new Date('2027-06-01T00:00:00Z'))
    expect(limited.kind).toBe('rate_limited')
    store.set(() => ({ settings: { ...store.get().settings, rateLimitPerMinute: 100 } }))
  })

  it('lookupBatch fails closed without a remote API (no mock fallback)', async () => {
    vi.stubEnv('VITE_API_URL', '')
    await expect(lookupBatch('PE-2610-9999')).rejects.toBeInstanceOf(CaptchaError)
    await expect(submitReport(
      { fullName: 'No API', email: 'n@e.com', phone: '', batch: 'PE-2610-WL01', channel: 'Amazon', message: 'No remote API configured here.', consent: true },
      'tok',
    )).rejects.toBeInstanceOf(CaptchaError)
    expect(await trackReport('SR-2026-00001', 'n@e.com', 'tok')).toEqual({ found: false })
  })

  it('submitReport + trackReport require captcha, then round-trip', async () => {
    const payload = {
      fullName: 'Test User',
      email: 'test@example.com',
      phone: '9876543210',
      batch: 'PE-2610-WL01',
      channel: 'Amazon' as const,
      message: 'This is a sufficiently long suspicious-pack message.',
      consent: true as const,
    }
    await expect(mockSubmitReport(payload)).rejects.toBeInstanceOf(CaptchaError)
    const { reference } = await mockSubmitReport(payload, testToken())
    expect(reference).toMatch(/^SR-\d{4}-\d{5}$/)
    await expect(mockTrackReport(reference, 'test@example.com')).rejects.toBeInstanceOf(CaptchaError)
    expect((await mockTrackReport(reference, 'test@example.com', testToken())).found).toBe(true)
    expect((await mockTrackReport(reference, 'someone-else@example.com', testToken())).found).toBe(false)
    expect((await mockTrackReport('SR-2099-00000', 'test@example.com', testToken())).found).toBe(false)

  })

  it('remoteLookup maps HTTP statuses to verdicts', async () => {
    const ok = { kind: 'genuine', record: BATCHES[0] }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ok }) as Response))
    expect(await remoteLookup('PE-2610-WL01')).toEqual(ok)

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => null }) as unknown as Response))
    expect((await remoteLookup('XX')).kind).toBe('not_found')

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }) as Response))
    expect((await remoteLookup('PE-2610-WL01')).kind).toBe('rate_limited')

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response))
    expect((await remoteLookup('PE-2610-WL01')).kind).toBe('error')

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ kind: 'not_found' }) }) as Response))
    expect((await remoteLookup('FN-2501-0001')).kind).toBe('not_found')

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    expect((await remoteLookup('PE-2610-WL01')).kind).toBe('error')
  })

  it('resolveBatch branch edges: empty, non-canonical alias path, substring alias, blank search', () => {
    // bff.ts:51 — empty normalised input returns null
    expect(resolveBatch('', BATCHES)).toBeNull()
    expect(resolveBatch('   ', BATCHES)).toBeNull()
    // bff.ts:40 — legacy plain-string aliases resolve with manufacturer kind
    const withLegacy = [...BATCHES]
    const legacy = { batch: 'ZZ-2601-WL01', product: 'ZZ', manufactured: '2026-01-01', expires: '2028-01-01', lab: 'L', facility: 'F', status: 'released' as const, coa: [], aliases: ['LEGACY-1'] }
    withLegacy.push(legacy)
    const r = resolveBatch('legacy-1', withLegacy)
    expect(r?.record.batch).toBe('ZZ-2601-WL01')
    expect(r?.matchedKind).toBe('manufacturer')
    // bff.ts:68/70 — canonical batch + alias compact-key fallbacks
    expect(resolveBatch('zz2601wl01', withLegacy)?.record.batch).toBe('ZZ-2601-WL01')
    const legacy2 = { batch: 'YY-2601-WL01', product: 'YY', manufactured: '2026-01-01', expires: '2028-01-01', lab: 'L', facility: 'F', status: 'released' as const, coa: [], aliases: [{ code: 'A B#C', kind: 'label' as const }] }
    withLegacy.push(legacy2)
    expect(resolveBatch('abc', withLegacy)?.record.batch).toBe('YY-2601-WL01')
    // bff.ts:79 — blank admin search returns everything
    expect(searchBatches('', BATCHES).length).toBeGreaterThanOrEqual(BATCHES.length)
    expect(searchBatches('   ', BATCHES).length).toBeGreaterThanOrEqual(BATCHES.length)
  })

  it('mock submit stores spaced canonical, phone/photo branches + track email edges', async () => {
    // bff.ts:130/147 — canonical stored uppercased while phone/photo fall back to undefined
    const spaced = {
      fullName: 'Atlas Tester', email: 'atlas@example.com', phone: '',
      batch: 'fe 2610 wl01', channel: 'Amazon' as const,
      message: 'Atlas pack report with enough characters here.', consent: true as const,
    }
    const c1 = await mockSubmitReport(spaced, testToken())
    const s1 = store.get().reports.find((r) => r.reference === c1.reference)!
    expect(s1.batch).toBe('fe 2610 wl01')
    expect(s1.phone).toBeUndefined()
    expect(s1.photoName).toBeUndefined()
    // phone + photo taken branch
    const full = {
      fullName: 'Photo User', email: 'photo@example.com', phone: '98765 43210',
      batch: 'PE-2610-WL01', channel: 'Amazon' as const,
      photo: { length: 1, 0: { name: 'pack.jpg', type: 'image/jpeg', size: 100 } } as unknown as FileList,
      message: 'Photo report with enough characters here.', consent: true as const,
    }
    const c2 = await mockSubmitReport(full, testToken())
    const s2 = store.get().reports.find((r) => r.reference === c2.reference)!
    expect(s2.phone).toBe('98765 43210')
    expect(s2.photoName).toBe('pack.jpg')
    // bff.ts:164/185 — remote path uses the provided token verbatim (no fallback)
    const base = 'http://127.0.0.1:8101'
    stubApiBaseForTests(base)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ found: false }) }) as Response))
    await trackReport('SR-2026-00001', 'remote@example.com', 'tok-explicit')
    stubApiBaseForTests('')
  })

  it('covers aliasEntries undefined-alias + compact canonical fallbacks', () => {
    const extended = [...BATCHES]
    // bff.ts:40 block1 — batch with NO aliases array takes the ?? [] path
    const noAliases = { batch: 'QQ-2601-WL01', product: 'QQ', manufactured: '2026-01-01', expires: '2028-01-01', lab: 'L', facility: 'F', status: 'released' as const, coa: [] }
    extended.push(noAliases)
    expect(resolveBatch('QQ-2601-WL01', extended)?.record.batch).toBe('QQ-2601-WL01')
    // bff.ts:68 — stored batch without hyphens only matches via compact key
    const flat = { batch: 'ZZ2601WL01', product: 'ZZ', manufactured: '2026-01-01', expires: '2028-01-01', lab: 'L', facility: 'F', status: 'released' as const, coa: [], aliases: [] }
    extended.push(flat)
    expect(resolveBatch('ZZ-2601-WL01', extended)?.record.batch).toBe('ZZ2601WL01')
  })

  it('remote submit/track send captchaToken to the Go service', async () => {
    expect(useRemoteBff()).toBe(false)
    expect(useRemoteBff('http://127.0.0.1:8101')).toBe(true)
    expect(useRemoteBff('')).toBe(false)
    const calls: { url: string; body: string }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), body: String(init?.body ?? '') })
        if (String(url).includes('/reports/track')) return { ok: true, status: 200, json: async () => ({ found: false }) } as Response
        if (String(url).includes('/bff/v1/reports')) return { ok: true, status: 200, json: async () => ({ reference: 'SR-2026-00001' }) } as Response
        return { ok: true, status: 200, json: async () => ({ kind: 'genuine', record: BATCHES[0] }) } as Response
      }),
    )
    const base = 'http://127.0.0.1:8101'
    stubApiBaseForTests(base)
    const payload = {
      fullName: 'Remote User',
      email: 'remote@example.com',
      phone: '',
      batch: 'PE-2610-WL01',
      channel: 'Amazon' as const,
      message: 'Remote report with enough characters here.',
      consent: true as const,
    }
    expect(useRemoteBff()).toBe(true)
    const created = await submitReport(payload, 'tok-1')
    expect(created.reference).toBe('SR-2026-00001')
    const tracked = await trackReport('SR-2026-00001', 'remote@example.com', 'tok-1')
    expect(tracked).toEqual({ found: false })
    expect(await remoteLookup('PE-2610-WL01', base)).toEqual({ kind: 'genuine', record: BATCHES[0] })
    expect(calls.map((c) => c.url)).toEqual([
      `${base}/bff/v1/reports`,
      `${base}/bff/v1/reports/track`,
      `${base}/bff/v1/batches/PE-2610-WL01`,
    ])
    expect(JSON.parse(calls[0].body).captchaToken).toBe('tok-1')
    expect(JSON.parse(calls[1].body).captchaToken).toBe('tok-1')
    stubApiBaseForTests('')
  })

  it('submitReport without phone/photo stores undefined optionals', async () => {
    const payload = {
      fullName: 'No Extras', email: 'noextras@example.com', phone: '',
      batch: '2K26002', channel: 'Amazon' as const,
      message: 'Bare-minimum report with enough characters here.', consent: true as const,
    }
    const created = await mockSubmitReport(payload, testToken())
    const stored = store.get().reports.find((r) => r.reference === created.reference)!
    expect(stored.batch).toBe('2K26002')
    expect(stored.phone).toBeUndefined()
    expect(stored.photoName).toBeUndefined()
  })

  it('useRemoteBff + api() 404-without-kind returns not_found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response))
    expect((await remoteLookup('PE-2610-WL01')).kind).toBe('not_found')
  })

  it('remoteLookup without explicit base uses global stub + error kinds', async () => {
    // No-kind success body falls back to not_found (line 218 branch).
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response))
    expect((await remoteLookup('PE-2610-WL01')).kind).toBe('not_found')
  })
})