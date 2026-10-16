import { type BatchAlias, type BatchRecord } from '../data/batches'
import type { SuspiciousReport } from '../data/admin-seed'
import type { ReportOutput } from './schemas'
import { compactKey, normaliseAlias, normaliseBatch } from './utils'
import { store } from './store'

/**
 * Browser-side client for the Bodylia BFF (batch.bodylia.in/bff/v1).
 * Mocked here with the same contract as Book 1 §4:
 *   GET  /bff/v1/batches/:batch        → LookupResult (alias-aware)
 *   POST /bff/v1/reports               → { reference }
 *   POST /bff/v1/reports/track         → TrackResult
 *   GET  /bff/v1/recalls               → BatchRecord[]
 *
 * Nomenclature (UIBatch standard):
 *   Canonical batch is ALWAYS XX-NNNN-XXNN, e.g. PE-2610-WL01.
 *   Manufacturer batch codes and label batch codes map per-batch in `aliases`;
 *   entering ANY mapped code resolves here so public search + admin search
 *   return the same product details ("searched in multiple ways").
 */

export type LookupResult =
  | { kind: 'genuine'; record: BatchRecord; matchedAlias?: string; matchedKind?: 'manufacturer' | 'label' }
  | { kind: 'expired'; record: BatchRecord; matchedAlias?: string; matchedKind?: 'manufacturer' | 'label' }
  | { kind: 'recalled'; record: BatchRecord; matchedAlias?: string; matchedKind?: 'manufacturer' | 'label' }
  | { kind: 'not_found' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'error' }

export interface ResolvedBatch {
  record: BatchRecord
  /** The alias the user typed that matched (undefined when canonical was typed). */
  matchedAlias?: string
  /** Whether the match came from a manufacturer or label mapping. */
  matchedKind?: 'manufacturer' | 'label'
}

/** All alias entries of a batch as { code, kind } pairs. */
function aliasEntries(b: BatchRecord): BatchAlias[] {
  return (b.aliases ?? []).map((a) => (typeof a === 'string' ? { code: a, kind: 'manufacturer' as const } : a))
}

/**
 * Resolve ANY printed code to its canonical BatchRecord.
 * Order: exact canonical (incl. space-tolerant) → exact mapped alias →
 * compact (punctuation-insensitive) match. Returns null when nothing matches.
 */
export function resolveBatch(rawInput: string): ResolvedBatch | null {
  const batches = store.get().batches
  const norm = normaliseAlias(rawInput)
  if (!norm) return null

  // 1. Exact canonical (e.g. PE-2610-WL01; spaces tolerated via normaliseBatch)
  const canon = normaliseBatch(rawInput)
  const canonical = batches.find((b) => b.batch === canon || b.batch === norm)
  if (canonical) return { record: canonical }

  // 2. Exact mapped alias (manufacturer or label code)
  for (const b of batches) {
    for (const a of aliasEntries(b)) {
      if (normaliseAlias(a.code) === norm) return { record: b, matchedAlias: normaliseAlias(a.code), matchedKind: a.kind }
    }
  }

  // 3. Compact match — ignore hyphens/spaces (e.g. PE2610WL01 ↔ PE-2610-WL01)
  const compact = compactKey(norm)
  for (const b of batches) {
    if (compactKey(b.batch) === compact) return { record: b }
    for (const a of aliasEntries(b)) {
      if (compactKey(a.code) === compact) return { record: b, matchedAlias: normaliseAlias(a.code), matchedKind: a.kind }
    }
  }
  return null
}

/** All canonical batches whose canonical code OR any mapped alias contains the query (admin search). */
export function searchBatches(query: string): BatchRecord[] {
  const n = normaliseAlias(query)
  if (!n) return store.get().batches
  const compact = compactKey(n)
  return store.get().batches.filter((b) => {
    const haystacks = [b.batch, ...aliasEntries(b).map((a) => a.code)]
    return haystacks.some((h) => {
      const hn = normaliseAlias(h)
      return hn.includes(n) || compactKey(h).includes(compact)
    })
  })
}

const WINDOW_MS = 60_000
let hits: number[] = []
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function lookupBatch(batch: string, now: Date = new Date()): Promise<LookupResult> {
  if (useRemoteBff()) return remoteLookup(batch)
  const t = now.getTime()
  const max = store.get().settings.rateLimitPerMinute
  hits = hits.filter((h) => t - h < WINDOW_MS)
  if (hits.length >= max) {
    return { kind: 'rate_limited', retryAfterSeconds: Math.ceil((WINDOW_MS - (t - hits[0])) / 1000) }
  }
  hits.push(t)

  await delay(450)
  const norm = normaliseAlias(batch)
  if (norm.endsWith('-9999') || compactKey(norm).endsWith('9999')) return { kind: 'error' }

  // Alias-aware resolution: canonical OR any mapped code resolves to one record.
  const resolved = resolveBatch(batch)
  if (!resolved) return { kind: 'not_found' }
  const { record, matchedAlias, matchedKind } = resolved
  if (!record.firstCheckedAt) {
    store.set((s) => ({
      batches: s.batches.map((b) => (b.batch === record.batch ? { ...b, firstCheckedAt: now.toISOString() } : b)),
    }))
  }
  if (record.status === 'recalled') return { kind: 'recalled', record, matchedAlias, matchedKind }
  if (new Date(record.expires) < now) return { kind: 'expired', record, matchedAlias, matchedKind }
  return { kind: 'genuine', record, matchedAlias, matchedKind }
}

export class CaptchaError extends Error {
  constructor(public reason: 'missing' | 'expired' | 'invalid') {
    super(reason)
  }
}

export async function submitReport(input: ReportOutput, captchaToken?: string): Promise<{ reference: string }> {
  if (useRemoteBff()) {
    return remoteSubmitReport(input, captchaToken ?? '')
  }
  if (!captchaToken) throw new CaptchaError('missing')
  await delay(600)
  const seq = String(Math.abs(hash(input.email + input.batch + Date.now())) % 100000).padStart(5, '0')
  const reference = `SR-${new Date().getFullYear()}-${seq}`
  const now = new Date().toISOString()
  store.set((s) => ({
    reports: [
      {
        reference,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone || undefined,
        batch: input.batch,
        channel: input.channel,
        message: input.message,
        photoName: input.photo && input.photo.length ? input.photo[0].name : undefined,
        createdAt: now,
        status: 'new',
        timeline: [{ at: now, by: 'Customer', kind: 'received', text: 'Report received via batch.bodylia.in' }],
      },
      ...s.reports,
    ],
  }))
  store.notify(`New report ${reference} is unassigned`, ['support', 'admin'])
  return { reference }
}

export type TrackResult = { found: false } | { found: true; report: SuspiciousReport }

/** Reference AND email must match — never reveals whether a reference exists on its own. */
export async function trackReport(reference: string, email: string, captchaToken?: string): Promise<TrackResult> {
  if (useRemoteBff()) {
    return remoteTrackReport(reference, email, captchaToken ?? '')
  }
  if (!captchaToken) throw new CaptchaError('missing')
  await delay(450)
  const report = store.get().reports.find((r) => r.reference === reference && r.email.toLowerCase() === email.toLowerCase())
  return report ? { found: true, report } : { found: false }
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

// --- Remote Go service seam (VITE_API_URL) ---

/** Base URL of the Go service. Empty string keeps the in-memory mock. */
export function apiBase(): string {
  const stubbed = (globalThis as { __VITE_API_URL?: string }).__VITE_API_URL
  const env = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env
  return resolveApiBase(stubbed, env)
}

/**
 * Pure resolution of the API base from its two sources (test stub first,
 * then Vite env). Extracted so every branch is unit-testable: `import.meta.env`
 * is always defined under vitest, so the env-undefined path of `apiBase()`
 * itself is unreachable in tests.
 */
export function resolveApiBase(stubbed: string | undefined, env: { VITE_API_URL?: string } | undefined): string {
  const raw = stubbed ?? env?.VITE_API_URL ?? ''
  return raw.replace(/\/$/, '')
}

/** Test hook: stub the API base without rebuilds (vitest only). */
export function stubApiBaseForTests(base: string): void {
  ;(globalThis as { __VITE_API_URL?: string }).__VITE_API_URL = base
}

export function useRemoteBff(base = apiBase()): boolean {
  return base !== ''
}

async function api<T>(path: string, init?: RequestInit, base = apiBase()): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok && res.status !== 404) {
    const err = new Error(`BFF ${res.status}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return res.json() as Promise<T>
}

export async function remoteLookup(batch: string, base = apiBase()): Promise<LookupResult> {
  try {
    const out = await api<LookupResult>(`/bff/v1/batches/${encodeURIComponent(batch)}`, undefined, base)
    return out && out.kind ? out : { kind: 'not_found' }
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 429) return { kind: 'rate_limited', retryAfterSeconds: 60 }
    if (status === 404) return { kind: 'not_found' }
    return { kind: 'error' }
  }
}

/** Remote report submit (Go service) — carries the PoW captcha token. */
export async function remoteSubmitReport(input: ReportOutput, captchaToken: string, base = apiBase()): Promise<{ reference: string }> {
  return api<{ reference: string }>(
    '/bff/v1/reports',
    { method: 'POST', body: JSON.stringify({ ...input, photo: undefined, captchaToken }) },
    base,
  )
}

/** Remote report tracking (Go service) — carries the PoW captcha token. */
export async function remoteTrackReport(reference: string, email: string, captchaToken: string, base = apiBase()): Promise<TrackResult> {
  return api<TrackResult>(
    '/bff/v1/reports/track',
    { method: 'POST', body: JSON.stringify({ reference, email, captchaToken }) },
    base,
  )
}
