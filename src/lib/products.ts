import { PRODUCTS, type Product } from '../data/products'
import { store } from './store'

/** Catalogue lookups read the editable catalogue (Admin → Catalogue), falling back to the seed. */
export function getProduct(code: string): Product {
  return (
    store.get().products.find((p) => p.code === code) ??
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
  return store.get().products.filter((p) => !p.archived)
}
