import type { ProductCode } from './catalog-static'
import { assertMockAllowed } from '../lib/runtime-env'

export interface CoaRow {
  test: string
  specification: string
  result: string
  pass: boolean
}

/**
 * Vendor-printed aliases for this canonical batch.
 * Canonical `batch` is ALWAYS XX-NNNN-XXNN (UIBatch standard).
 * Manufacturer batch codes and label batch codes map here — entering ANY
 * mapped code resolves to this canonical record for public verify + admin search.
 * Stored normalised via normaliseAlias() (spaces stripped, uppercase).
 */
export interface BatchAlias {
  code: string
  kind: 'manufacturer' | 'label'
}

export interface BatchRecord {
  batch: string
  product: ProductCode
  manufactured: string // ISO date
  expires: string // ISO date
  lab: string
  facility: string
  status: 'released' | 'recalled'
  recallReason?: string
  /** Units in the pack (first-batch table: 1000). */
  qty?: number
  /** Maximum retail price in INR (first-batch table). */
  mrp?: number
  coa: CoaRow[]
  /** Set on the first public check. Edits after this need a recorded reason. */
  firstCheckedAt?: string
  coaFileName?: string
  /** Mapped manufacturer / label codes. Legacy string[] also accepted at read time. */
  aliases?: (string | BatchAlias)[]
}

/** Normalised alias code regardless of stored shape. */
export function aliasCode(a: string | BatchAlias): string {
  return typeof a === 'string' ? a : a.code
}

/** Alias kind (defaults to manufacturer for legacy string entries). */
export function aliasKind(a: string | BatchAlias): 'manufacturer' | 'label' {
  return typeof a === 'string' ? 'manufacturer' : a.kind
}

/**
 * NOTE: mock batch fixtures (BATCHES / DEMO_BATCHES) were REMOVED from this
 * module (WSOD fix, Oct 2026). This file now exports pure types + alias
 * helpers only, so lib/bff.ts can import it safely in production builds.
 * Dev/test fixtures live in data/mock-batches.ts (guarded by
 * assertMockAllowed) and are seeded from the same first-batch table.
 */
