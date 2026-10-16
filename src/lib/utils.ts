import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * UIBatch canonical standard: XX-NNNN-XXNN
 *   XX   — 2 alphanumeric chars (A–Z, 0–9), e.g. PE
 *   NNNN — 4 digits, e.g. 2610
 *   XXNN — 2 alphanumeric chars + 2 digits, e.g. WL01
 * e.g. PE-2610-WL01. Spaces are stripped/ignored everywhere.
 */
export const UIBATCH_PATTERN = /^[A-Z0-9]{2}-\d{4}-[A-Z0-9]{2}\d{2}$/

/** Strip ALL whitespace, then uppercase. Spaces are always ignored. */
export function stripSpaces(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

/**
 * Normalise a canonical UIBatch input: strip spaces, uppercase, ensure the
 * two hyphens are present (auto-insert when the user types 10 alphanumerics).
 * Returns the normalised string WITHOUT validating — use isCanonicalBatch().
 * e.g. "pe 2610 wl01" -> "PE-2610-WL01", "PE2610WL01" -> "PE-2610-WL01".
 */
export function normaliseBatch(raw: string): string {
  const s = stripSpaces(raw).replace(/[-_/.]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const compact = s.replace(/[^A-Z0-9]/g, '')
  if (/^[A-Z0-9]{2}\d{4}[A-Z0-9]{2}\d{2}$/.test(compact)) {
    return `${compact.slice(0, 2)}-${compact.slice(2, 6)}-${compact.slice(6, 10)}`
  }
  return s.toUpperCase()
}

export const CANONICAL_BATCH_PATTERN = UIBATCH_PATTERN

export function isCanonicalBatch(value: string): boolean {
  return UIBATCH_PATTERN.test(stripSpaces(value))
}

/** Split a canonical code into its XX / NNNN / XXNN parts (null when invalid). */
export function parseCanonicalBatch(value: string): { prefix: string; mid: string; serial: string } | null {
  const n = normaliseBatch(value)
  const m = /^([A-Z0-9]{2})-(\d{4})-([A-Z0-9]{2}\d{2})$/.exec(n)
  if (!m) return null
  return { prefix: m[1], mid: m[2], serial: m[3] }
}

/**
 * Normalise ANY printed code (canonical UIBatch, manufacturer code, or label code):
 * strip spaces, uppercase, convert underscores/slashes/dots to hyphens,
 * collapse repeats, strip leading/trailing hyphens.
 * Examples:
 *   "pe 2610 wl01" -> "PE-2610-WL01"
 *   "2k26001" -> "2K26001"
 */
export function normaliseAlias(raw: string): string {
  return stripSpaces(raw)
    .replace(/[_/.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Compact key for fuzzy matching: strip every non-alphanumeric, uppercase. */
export function compactKey(value: string): string {
  return stripSpaces(value).replace(/[^A-Z0-9]/g, '')
}

/** Allowed alias characters (after normalisation): letters, digits, hyphen, hash. */
export const ALIAS_ALLOWED = /^[A-Z0-9][A-Z0-9\-#]*[A-Z0-9]$/

/**
 * Sensible per-position error for canonical validation, or null when valid.
 * Used by the zod schema AND the Go API so messages match everywhere.
 */
export function canonicalBatchError(raw: string): string | null {
  const input = raw ?? ''
  if (stripSpaces(input) === '') return 'Enter the batch number printed on your pack.'
  const s = stripSpaces(input)
  if (/[^A-Za-z0-9\s\-_/.]/.test(input)) {
    return 'Batch numbers only use letters, digits, spaces and hyphens — check what is printed on the pack.'
  }
  const n = normaliseBatch(input)
  const parts = n.split('-')
  if (parts.length !== 3) {
    return `Batch numbers look like PE-2610-WL01: 2 characters, a hyphen, 4 digits, a hyphen, then 2 characters and 2 digits. You entered “${s}”.`
  }
  const [xx, mid, serial] = parts
  // parts always has 3 non-empty strings here (normaliseBatch strips
  // leading/trailing hyphens and collapses repeats), so no empty fallbacks.
  if (!/^[A-Z0-9]{2}$/.test(xx)) {
    return `The first 2 characters can be letters or digits (A–Z, 0–9), e.g. “PE” in PE-2610-WL01. You entered “${xx}”.`
  }
  if (!/^\d{4}$/.test(mid)) {
    return `The middle 4 characters must be digits, e.g. “2610” in PE-2610-WL01. You entered “${mid}”.`
  }
  if (!/^[A-Z0-9]{2}\d{2}$/.test(serial)) {
    return `The last 4 characters must be 2 letters or digits followed by 2 digits, e.g. “WL01” in PE-2610-WL01. You entered “${serial}”.`
  }
  return null
}



