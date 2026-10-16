/**
 * Static catalogue constants — PROD-SAFE (no mock data, no guard).
 * Display-only strings baked at build time: brand assets, product display
 * names, and the sample-batch hint list shown behind SHOW_PREVIEW_HINTS.
 * Canonical DATA (batches, users, reports) lives in Postgres and is reached
 * via the Go API (see lib/bff.ts). Fixture twins of these constants live in
 * data/products.ts + data/batches.ts for dev/test and MUST NOT be imported
 * by production render paths (data-isolation.test.ts enforces this).
 */

export type ProductCode = string

export interface Product {
  code: ProductCode
  name: string
  claim: string
  format: string
  image: string
  shelfLifeMonths: number
  archived?: boolean
}

export const CATALOGUE: Record<string, Product> = {
  PE: { code: 'PE', name: 'PeriHarmon', claim: 'Complete hormonal, metabolic & adaptogenic support', format: 'CAPSULE · 1000 units', image: 'https://cdn.magicpatterns.com/uploads/2JSsTRonWoayLZt672W9PR/transparent-PeriHarmon.png', shelfLifeMonths: 18 },
  FE: { code: 'FE', name: 'FerriMune', claim: 'Advanced iron absorption & immune defense formula', format: 'CAPSULE · 1000 units', image: 'https://cdn.magicpatterns.com/uploads/aCzupDzefqtcCmrHxir5C5/transparent-Ferrimune.png', shelfLifeMonths: 18 },
  FN: { code: 'FN', name: 'FertiliNova', claim: 'Premium fertility & reproductive health support', format: 'CAPSULE · 1000 units', image: 'https://cdn.magicpatterns.com/uploads/haHb8DefwJ4NrLgSuUshAy/transparent-FertiliNova.png', shelfLifeMonths: 18 },
  MB: { code: 'MB', name: 'MaternaBloom', claim: 'Systemic hormonal harmony & menstrual cycle balance', format: 'CAPSULE · 1000 units', image: 'https://cdn.magicpatterns.com/uploads/tMgHkvs3TM991yc9SkUbzi/transparent-MaternaBloom.png', shelfLifeMonths: 18 },
  CI: { code: 'CI', name: 'Cindoria', claim: 'Advanced botanical defence for urinary tract protection', format: 'SACHET · 1000 units', image: 'https://cdn.magicpatterns.com/uploads/x2QGN2QuRAtgYDHZVScVbT/cindoria-zip-lock-front-filled.png', shelfLifeMonths: 18 },
}

export const SUPPORT_EMAIL = 'care@bodylia.in'

export const GLYPH = '/bodylia-glyph.png'
export const WORDMARK = 'https://cdn.magicpatterns.com/uploads/dcbJmwEmJcg4ctVTchnFqj/bodylia-wordart.png'

export const DEMO_HINTS: Array<{ batch: string; label: string }> = [
  { batch: 'PE-2610-WL01', label: 'PeriHarmon · sample' },
  { batch: 'FE-2610-WL01', label: 'FerriMune · sample' },
  { batch: '2K26001', label: 'Manufacturer code · sample' },
]
