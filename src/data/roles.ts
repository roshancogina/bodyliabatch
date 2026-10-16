import type { Role } from './admin-seed'

/**
 * Role labels/descriptions — PROD-SAFE display strings (no fixtures, no
 * guard). Split out of data/admin-seed.ts so production builds of the staff
 * console (SignIn, ProdShell) can render them without evaluating the mock
 * SEED_* fixtures, which throw at module load in production.
 */
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  quality: 'Quality analyst',
  support: 'Customer support',
}

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: 'Everything, including staff, catalogue and settings.',
  quality: 'Release, correct and recall batches; investigate counterfeits.',
  support: 'Resolve customer reports and reply. Batches are view-only.',
}
