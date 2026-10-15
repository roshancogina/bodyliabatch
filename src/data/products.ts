import { assertMockAllowed } from '../lib/runtime-env'

/** Two-letter code embedded in every batch number (BDL-<code>-YYMM-NNNN). */
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
 */
export const PRODUCTS: Record<string, Product> = (() => {
  assertMockAllowed('mock PRODUCTS fixture')
  return {
  CN: {
    code: 'CN',
    name: 'Cindoria',
    claim: 'Advanced botanical defence for urinary tract protection',
    format: '30 sachets × 5 g · Cranberry',
    image: 'https://cdn.magicpatterns.com/uploads/x2QGN2QuRAtgYDHZVScVbT/cindoria-zip-lock-front-filled.png',
    shelfLifeMonths: 18,
  },
  FR: {
    code: 'FR',
    name: 'Ferrimune',
    claim: 'Advanced iron absorption & immune defense formula',
    format: '30 veg. HPMC capsules',
    image: 'https://cdn.magicpatterns.com/uploads/aCzupDzefqtcCmrHxir5C5/transparent-Ferrimune.png',
    shelfLifeMonths: 24,
  },
  FN: {
    code: 'FN',
    name: 'FertiliNova',
    claim: 'Premium fertility & reproductive health support',
    format: '30 veg. HPMC capsules',
    image: 'https://cdn.magicpatterns.com/uploads/haHb8DefwJ4NrLgSuUshAy/transparent-FertiliNova.png',
    shelfLifeMonths: 24,
  },
  MB: {
    code: 'MB',
    name: 'MaternaBloom',
    claim: 'Systemic hormonal harmony & menstrual cycle balance',
    format: '30 veg. HPMC capsules',
    image: 'https://cdn.magicpatterns.com/uploads/tMgHkvs3TM991yc9SkUbzi/transparent-MaternaBloom.png',
    shelfLifeMonths: 24,
  },
  PH: {
    code: 'PH',
    name: 'PeriHarmon',
    claim: 'Complete hormonal, metabolic & adaptogenic support',
    format: '30 veg. HPMC capsules',
    image: 'https://cdn.magicpatterns.com/uploads/2JSsTRonWoayLZt672W9PR/transparent-PeriHarmon.png',
    shelfLifeMonths: 24,
  },
  PD: {
    code: 'PD',
    name: 'ProteoDiva',
    claim: 'Micronutrient protein for strength, energy & hormonal balance',
    format: '200 g tub · Belgian chocolate',
    image: 'https://cdn.magicpatterns.com/uploads/2YNkPMGbXQU76PGSh8k3ah/transparent-proteodiva.png',
    shelfLifeMonths: 12,
  },
  }
})()

export const GLYPH = 'https://cdn.magicpatterns.com/uploads/iiwh2Bz47wSQNZqRbyzEbU/bodylia-glyph.png'
export const WORDMARK = 'https://cdn.magicpatterns.com/uploads/dcbJmwEmJcg4ctVTchnFqj/bodylia-wordart.png'
