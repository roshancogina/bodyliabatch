import { BATCHES } from '../data/mock-batches'
import type { BatchRecord } from '../data/batches'
import type { ReportOutput } from './schemas'
import { assertMockAllowed } from './runtime-env'
import { compactKey, normaliseAlias, normaliseBatch } from './utils'
import { resolveBatch, searchBatches, CaptchaError, type LookupResult, type TrackResult } from './bff'
import { store } from './store'

assertMockAllowed('mock BFF client')

const WINDOW_MS = 60_000
let hits: number[] = []
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Test hook: reset the in-memory rate-limit window between cases. */
export function resetMockRateLimit(): void {
  hits = []
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

export function mockBatchList(): BatchRecord[] {
  return BATCHES
}

export async function mockLookup(batch: string, now: Date = new Date()): Promise<LookupResult> {
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
  const resolved = resolveBatch(batch, store.get().batches)
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

export async function mockSubmitReport(input: ReportOutput, captchaToken?: string): Promise<{ reference: string }> {
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

export async function mockTrackReport(reference: string, email: string, captchaToken?: string): Promise<TrackResult> {
  if (!captchaToken) throw new CaptchaError('missing')
  await delay(450)
  const report = store.get().reports.find((r) => r.reference === reference && r.email.toLowerCase() === email.toLowerCase())
  return report ? { found: true, report } : { found: false }
}

export function mockSearch(query: string): BatchRecord[] {
  return searchBatches(query, BATCHES)
}

export { normaliseBatch }
