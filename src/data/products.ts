import { assertMockAllowed } from '../lib/runtime-env'
import { CATALOGUE, type Product } from './catalog-static'

export type { ProductCode, Product } from './catalog-static'

/**
 * MOCK catalogue fixture — dev/test only (mock store seed).
 * Prod-safe twin: CATALOGUE in ./catalog-static (no guard).
 * Kept in sync by data-isolation.test.ts.
 */
export const PRODUCTS: Record<string, Product> = (() => {
  assertMockAllowed('mock PRODUCTS fixture')
  return CATALOGUE
})()

export { GLYPH, WORDMARK } from './catalog-static'

