import { assertMockAllowed } from '../lib/runtime-env'

/** Two-letter code at the start of every UIBatch number (XX-NNNN-XXNN). */
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

/**
 * MOCK catalogue fixture — dev/test only. Canonical source is the
 * products table in Postgres (backend-go/migrations/002_*).
 * Codes match the first-batch table: PE/FE/FN/MB/CI.
 */
export const PRODUCTS: Record<string, Product> = (() => {
  assertMockAllowed('mock PRODUCTS fixture')
  return {
  PE: {
    code: 'PE',
    name: 'PeriHarmon',
    claim: 'Complete hormonal, metabolic & adaptogenic support',
    format: 'CAPSULE · 1000 units',
    image: 'https://cdn.magicpatterns.com/uploads/2JSsTRonWoayLZt672W9PR/transparent-PeriHarmon.png',
    shelfLifeMonths: 18,
  },
  FE: {
    code: 'FE',
    name: 'FerriMune',
    claim: 'Advanced iron absorption & immune defense formula',
    format: 'CAPSULE · 1000 units',
    image: 'https://cdn.magicpatterns.com/uploads/aCzupDzefqtcCmrHxir5C5/transparent-Ferrimune.png',
    shelfLifeMonths: 18,
  },
  FN: {
    code: 'FN',
    name: 'FertiliNova',
    claim: 'Premium fertility & reproductive health support',
    format: 'CAPSULE · 1000 units',
    image: 'https://cdn.magicpatterns.com/uploads/haHb8DefwJ4NrLgSuUshAy/transparent-FertiliNova.png',
    shelfLifeMonths: 18,
  },
  MB: {
    code: 'MB',
    name: 'MaternaBloom',
    claim: 'Systemic hormonal harmony & menstrual cycle balance',
    format: 'CAPSULE · 1000 units',
    image: 'https://cdn.magicpatterns.com/uploads/tMgHkvs3TM991yc9SkUbzi/transparent-MaternaBloom.png',
    shelfLifeMonths: 18,
  },
  CI: {
    code: 'CI',
    name: 'Cindoria',
    claim: 'Advanced botanical defence for urinary tract protection',
    format: 'SACHET · 1000 units',
    image: 'https://cdn.magicpatterns.com/uploads/x2QGN2QuRAtgYDHZVScVbT/cindoria-zip-lock-front-filled.png',
    shelfLifeMonths: 18,
  },
  }
})()

export const GLYPH = '/bodylia-glyph.png'
export const WORDMARK = 'https://cdn.magicpatterns.com/uploads/dcbJmwEmJcg4ctVTchnFqj/bodylia-wordart.png'
