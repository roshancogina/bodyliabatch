import type { Role } from '../../data/admin-seed'
import { MATRIX, type Permission } from '../../lib/auth'

/** Human-readable capabilities, derived from the permission matrix so they never drift. */
const CAPS: [string, Permission][] = [
  ['View batches', 'batches.view'],
  ['Register, edit and bulk-import batches', 'batches.register'],
  ['Recall or lift a recall', 'batches.recall'],
  ['Work and reply to customer reports', 'reports.reply'],
  ['Escalate reports to quality', 'reports.escalate'],
  ['Decide on escalations', 'escalations.handle'],
  ['See counterfeit intelligence', 'intelligence.view'],
  ['View the audit log', 'audit.view'],
  ['Export the audit log', 'audit.export'],
  ['Manage staff and roles', 'users.manage'],
  ['Manage the catalogue', 'catalogue.manage'],
  ['Change system settings', 'settings.manage'],
]

export const CAPABILITIES: [string, Record<Role, boolean>][] = CAPS.map(([label, p]) => [
  label,
  { admin: MATRIX.admin.includes(p), quality: MATRIX.quality.includes(p), support: MATRIX.support.includes(p) },
])

export function diffRoles(from: Role, to: Role) {
  return {
    gains: CAPABILITIES.filter(([, r]) => r[to] && !r[from]).map(([l]) => l),
    loses: CAPABILITIES.filter(([, r]) => r[from] && !r[to]).map(([l]) => l),
  }
}
