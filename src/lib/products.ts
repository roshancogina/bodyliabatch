import { CATALOGUE as PRODUCTS, type Product } from '../data/catalog-static'

/**
 * Catalogue lookups — prod-safe. The static CATALOGUE is the single source
 * for display (pack shots, names); the admin console edits the live catalogue
 * via the Go API in production, or the mock store in dev/test.
 */
export function getProduct(code: string): Product {
  return (
    PRODUCTS[code] ?? {
      code,
      name: `Unknown product (${code})`,
      claim: '',
      format: '',
      image: PRODUCTS.PE.image,
      shelfLifeMonths: 24,
    }
  )
}

export function listProducts(): Product[] {
  return Object.values(PRODUCTS).filter((p) => !p.archived)
}
