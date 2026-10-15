import type { BatchRecord } from '../data/batches'
import type { SuspiciousReport } from '../data/admin-seed'
import type { ReportOutput } from './schemas'
import { compactKey, normaliseAlias } from './utils'
import { store } from './store'

/**
 * Browser-side client for the Bodylia BFF (batch.bodylia.in/bff/v1).
 * Mocked here with the same contract as Book 1 §4:
 *   GET  /bff/v1/batches/:batch        → LookupResult (alias-aware)
 *   POST /bff/v1/reports               → { reference }
 *   POST /bff/v1/reports/track         → TrackResult
 *   GET  /bff/v1/recalls               → BatchRecord[]
 *
 * Nomenclature:
 *   Canonical batch is ALWAYS BDL-<CODE>-YYMM-NNNN.
 *   Vendor lot codes are stored per-batch in `aliases` and resolved here so
 *   public search + admin search accept EITHER spelling ("searched in multiple ways").
 */

export type LookupResult =
  | { kind: 'genuine'; record: BatchRecord; matchedAlias?: string }
  | { kind: 'expired'; record: BatchRecord; matchedAlias?: string }
  | { kind: 'recalled'; record: BatchRecord; matchedAlias?: string }
  | { kind: 'not_found' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'error' }

export interface ResolvedBatch {
  record: BatchRecord
  /** The alias the user typed that matched (undefined when canonical was typed). */
  matchedAlias?: string
}

/**
 * Resolve ANY printed code to its canonical BatchRecord.
 * Order: exact canonical → exact normalised alias → compact (punctuation-insensitive) match.
 * Returns null when nothing matches.
 */
export function resolveBatch(rawInput: string): ResolvedBatch | null {
  const batches = store.get().batches
  const norm = normaliseAlias(rawInput)
  if (!norm) return null

  // 1. Exact canonical (e.g. BDL-FR-2509-0312)
  const canonical = batches.find((b) => b.batch === norm)
  if (canonical) return { record: canonical }

  // 2. Exact normalised alias (e.g. FR-2509-312, VND-FR-0312)
  for (const b of batches) {
    const aliases = (b.aliases ?? []).map((a) => normaliseAlias(a))
    if (aliases.includes(norm)) return { record: b, matchedAlias: norm }
  }

  // 3. Compact match — ignore hyphens/spaces/slashes (e.g. FR25090312 ↔ FR-2509-312)
  const compact = compactKey(norm)
  for (const b of batches) {
    if (compactKey(b.batch) === compact) return { record: b }
    for (const a of b.aliases ?? []) {
      if (compactKey(a) === compact) return { record: b, matchedAlias: normaliseAlias(a) }
    }
  }
  return null
}

/** All canonical batches whose canonical code OR any alias contains the query (admin search). */
export function searchBatches(query: string): BatchRecord[] {
  const n = normaliseAlias(query)
  if (!n) return store.get().batches
  const compact = compactKey(n)
  return store.get().batches.filter((b) => {
    const haystacks = [b.batch, ...(b.aliases ?? [])]
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

  // Alias-aware resolution: canonical OR any vendor alias resolves to one record.
  const resolved = resolveBatch(batch)
  if (!resolved) return { kind: 'not_found' }
  const { record, matchedAlias } = resolved
  if (!record.firstCheckedAt) {
    store.set((s) => ({
      batches: s.batches.map((b) => (b.batch === record.batch ? { ...b, firstCheckedAt: now.toISOString() } : b)),
    }))
  }
  if (record.status === 'recalled') return { kind: 'recalled', record, matchedAlias }
  if (new Date(record.expires) < now) return { kind: 'expired', record, matchedAlias }
  return { kind: 'genuine', record, matchedAlias }
}

export async function submitReport(input: ReportOutput): Promise<{ reference: string }> {
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
export async function trackReport(reference: string, email: string): Promise<TrackResult> {
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
export const API_URL: string =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? '').replace(/\/$/, '')

export function useRemoteBff(): boolean {
  return API_URL !== ''
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
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

export async function remoteLookup(batch: string): Promise<LookupResult> {
  try {
    const out = await api<LookupResult>(`/bff/v1/batches/${encodeURIComponent(batch)}`)
    return out && out.kind ? out : { kind: 'not_found' }
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 429) return { kind: 'rate_limited', retryAfterSeconds: 60 }
    if (status === 404) return { kind: 'not_found' }
    return { kind: 'error' }
  }
}
