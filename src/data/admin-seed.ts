import { assertMockAllowed } from '../lib/runtime-env'

export type Role = 'admin' | 'quality' | 'support'

export interface StaffUser {
  id: string
  name: string
  email: string
  role: Role
  status: 'active' | 'invited' | 'deactivated'
  lastActive: string // ISO
  mfa: boolean
  invitedBy?: string
}

export type ReportStatus = 'new' | 'investigating' | 'resolved_genuine' | 'resolved_counterfeit'

export type TimelineKind = 'received' | 'note' | 'status' | 'reply' | 'escalation' | 'assign'

export interface TimelineEvent {
  at: string
  by: string
  kind: TimelineKind
  text: string
}

export interface Escalation {
  by: string
  at: string
  reason: string
  urgency: 'standard' | 'urgent'
  state: 'open' | 'accepted' | 'returned'
  handledBy?: string
}

export interface SuspiciousReport {
  reference: string
  fullName: string
  email: string
  phone?: string
  batch: string
  channel: string
  message: string
  photoName?: string
  createdAt: string
  status: ReportStatus
  assignee?: string
  escalation?: Escalation
  timeline: TimelineEvent[]
}

export interface AuditEvent {
  id: string
  at: string
  actor: string
  action: string
  target: string
  detail?: string
}

export interface Site {
  id: string
  name: string
  accreditation?: string
  accreditationExpires?: string
  archived: boolean
}

export interface Settings {
  rateLimitPerMinute: number
  replyTargetHours: number
  supportEmail: string
  retentionMonths: number
  sessionMinutes: number
  maintenance: boolean
  maintenanceMessage: string
  maintenanceUntil: string
}

export interface Notification {
  id: string
  at: string
  text: string
  read: boolean
  roles: Role[]
}

export interface Hotspot {
  batch: string
  product: string
  checks7d: number
  checksPrev7d: number
  topChannel: string
  topCity: string
  linkedReports: string[]
}

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

export const STATUS_LABEL: Record<ReportStatus, string> = {
  new: 'New',
  investigating: 'Investigating',
  resolved_genuine: 'Resolved · genuine',
  resolved_counterfeit: 'Resolved · counterfeit',
}

/** Seed timestamps are relative to page load so the preview always looks current. */
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

/**
 * MOCK FIXTURES — dev/test only. Every SEED_* below throws in production builds.
 * Canonical source is Postgres (backend-go/migrations/002_*, 003_*).
 */
const mock = <T>(name: string, build: () => T): T => {
  assertMockAllowed(`mock ${name} fixture`)
  return build()
}

export const SEED_USERS: StaffUser[] = mock('SEED_USERS', () => [
  { id: 'u1', name: 'Meera Iyer', email: 'admin@bodylia.in', role: 'admin', status: 'active', lastActive: ago(0.2), mfa: true },
  { id: 'u2', name: 'Rohan Desai', email: 'qa@bodylia.in', role: 'quality', status: 'active', lastActive: ago(1), mfa: true },
  { id: 'u3', name: 'Ananya Sen', email: 'support@bodylia.in', role: 'support', status: 'active', lastActive: ago(3), mfa: true },
  { id: 'u6', name: 'Vikram Rao', email: 'vikram.r@bodylia.in', role: 'support', status: 'active', lastActive: ago(20), mfa: true },
  { id: 'u4', name: 'Kabir Malhotra', email: 'kabir.m@bodylia.in', role: 'quality', status: 'invited', lastActive: ago(50), mfa: false, invitedBy: 'Meera Iyer' },
  { id: 'u5', name: 'Farah Khan', email: 'farah.k@bodylia.in', role: 'support', status: 'deactivated', lastActive: ago(1700), mfa: true },
])

export const SEED_REPORTS: SuspiciousReport[] = mock('SEED_REPORTS', () => [
  {
    reference: 'SR-2026-04821',
    fullName: 'Asha Rao',
    email: 'asha.rao@example.com',
    phone: '98450 12345',
    batch: 'BDL-FN-2501-0001',
    channel: 'Flipkart',
    message: 'Batch number is not recognised on your site. The label print looks blurry and the seal was loose.',
    photoName: 'fertilinova-label.jpg',
    createdAt: ago(5),
    status: 'new',
    timeline: [{ at: ago(5), by: 'Customer', kind: 'received', text: 'Report received via batch.bodylia.in' }],
  },
  {
    reference: 'SR-2026-04817',
    fullName: 'Nisha Verma',
    email: 'nisha.v@example.com',
    batch: 'BDL-FN-2501-0001',
    channel: 'Flipkart',
    message: 'Bought from WellnessKart on Flipkart. Capsules smell odd and the bottle has no foil seal under the cap.',
    createdAt: ago(19),
    status: 'investigating',
    assignee: 'Ananya Sen',
    escalation: { by: 'Ananya Sen', at: ago(16), reason: 'Second report on the same unregistered batch from the same seller in 24 hours. Possible counterfeit cluster.', urgency: 'urgent', state: 'open' },
    timeline: [
      { at: ago(19), by: 'Customer', kind: 'received', text: 'Report received via batch.bodylia.in' },
      { at: ago(18), by: 'Ananya Sen', kind: 'assign', text: 'Assigned to Ananya Sen' },
      { at: ago(16), by: 'Ananya Sen', kind: 'escalation', text: 'Escalated to quality (urgent)' },
    ],
  },
  {
    reference: 'SR-2026-04790',
    fullName: 'Priya Nair',
    email: 'priya.n@example.com',
    batch: 'BDL-FR-2509-0312',
    channel: 'Pharmacy or store',
    message: 'Capsule colour looks darker than my previous pack of Ferrimune. Want to be sure it is safe.',
    createdAt: ago(31),
    status: 'new',
    timeline: [{ at: ago(31), by: 'Customer', kind: 'received', text: 'Report received via batch.bodylia.in' }],
  },
  {
    reference: 'SR-2026-04712',
    fullName: 'Divya Menon',
    email: 'divya.m@example.com',
    batch: 'BDL-PH-2504-0777',
    channel: 'bodylia.in',
    message: 'Got a recall message when checking my PeriHarmon pack. How do I get a replacement?',
    createdAt: ago(52),
    status: 'investigating',
    assignee: 'Vikram Rao',
    timeline: [
      { at: ago(52), by: 'Customer', kind: 'received', text: 'Report received via batch.bodylia.in' },
      { at: ago(50), by: 'Vikram Rao', kind: 'assign', text: 'Assigned to Vikram Rao' },
      { at: ago(49), by: 'Vikram Rao', kind: 'note', text: 'Replacement order raised, awaiting courier pickup of the recalled pack.' },
    ],
  },
  {
    reference: 'SR-2026-04650',
    fullName: 'Sneha Kulkarni',
    email: 'sneha.k@example.com',
    batch: 'BDL-MB-2311-0099',
    channel: 'Flipkart',
    message: 'Seller listing was 60% cheaper than the website. Box has spelling mistakes on the back panel.',
    createdAt: ago(110),
    status: 'resolved_counterfeit',
    assignee: 'Rohan Desai',
    timeline: [
      { at: ago(110), by: 'Customer', kind: 'received', text: 'Report received via batch.bodylia.in' },
      { at: ago(96), by: 'Rohan Desai', kind: 'note', text: 'Batch never produced. Photos confirm non-Bodylia print. Seller reported to Flipkart brand protection.' },
      { at: ago(95), by: 'Rohan Desai', kind: 'status', text: 'Status → Resolved · counterfeit' },
      { at: ago(95), by: 'Rohan Desai', kind: 'reply', text: 'Reply sent: “Your pack is not genuine”' },
    ],
  },
  {
    reference: 'SR-2026-04601',
    fullName: 'Lakshmi Pillai',
    email: 'lakshmi.p@example.com',
    batch: 'BDL-CN-2510-1180',
    channel: 'bodylia.in',
    message: 'Pouch zip arrived slightly open. Checking whether sachets are still sealed and okay to use.',
    createdAt: ago(140),
    status: 'resolved_genuine',
    assignee: 'Ananya Sen',
    timeline: [
      { at: ago(140), by: 'Customer', kind: 'received', text: 'Report received via batch.bodylia.in' },
      { at: ago(137), by: 'Ananya Sen', kind: 'note', text: 'Genuine batch. Individual sachets are sealed; advised safe to use and sent a goodwill voucher.' },
      { at: ago(137), by: 'Ananya Sen', kind: 'status', text: 'Status → Resolved · genuine' },
      { at: ago(137), by: 'Ananya Sen', kind: 'reply', text: 'Reply sent: “Your pack is genuine”' },
    ],
  },
])

export const SEED_AUDIT: AuditEvent[] = mock('SEED_AUDIT', () => [
  { id: 'a0', at: ago(16), actor: 'Ananya Sen', action: 'Escalated report', target: 'SR-2026-04817', detail: 'Urgent' },
  { id: 'a1', at: ago(26), actor: 'Meera Iyer', action: 'Signed in', target: 'admin@bodylia.in' },
  { id: 'a2', at: ago(40), actor: 'Rohan Desai', action: 'Registered batch', target: 'BDL-CN-2510-1180' },
  { id: 'a3', at: ago(49), actor: 'Vikram Rao', action: 'Updated report', target: 'SR-2026-04712', detail: 'Status → Investigating' },
  { id: 'a4', at: ago(95), actor: 'Rohan Desai', action: 'Resolved report', target: 'SR-2026-04650', detail: 'Counterfeit' },
  { id: 'a5', at: ago(600), actor: 'Rohan Desai', action: 'Recalled batch', target: 'BDL-PH-2504-0777', detail: 'Labelling error — wrong serving size' },
  { id: 'a6', at: ago(650), actor: 'Meera Iyer', action: 'Changed role', target: 'kabir.m@bodylia.in', detail: 'Customer support → Quality analyst' },
  { id: 'a7', at: ago(700), actor: 'Meera Iyer', action: 'Updated settings', target: 'Reply target', detail: '72 h → 48 h' },
])

export const SEED_FACILITIES: Site[] = mock('SEED_FACILITIES', () => [
  { id: 'f1', name: 'Unit 1, Baddi, Himachal Pradesh', accreditation: 'GMP-HP-1187', accreditationExpires: '2027-06-30', archived: false },
  { id: 'f2', name: 'Unit 2, Baddi, Himachal Pradesh', accreditation: 'GMP-HP-2210', accreditationExpires: '2026-11-30', archived: false },
])

export const SEED_LABS: Site[] = mock('SEED_LABS', () => [
  { id: 'l1', name: 'Eurofins Analytical Services India, Bengaluru', accreditation: 'NABL TC-5527', accreditationExpires: '2027-03-31', archived: false },
  { id: 'l2', name: 'TÜV SÜD South Asia, Chennai', accreditation: 'NABL TC-6012', accreditationExpires: '2026-08-31', archived: false },
])

export const SEED_SETTINGS: Settings = mock('SEED_SETTINGS', () => ({
  rateLimitPerMinute: 10,
  replyTargetHours: 48,
  supportEmail: 'care@bodylia.in',
  retentionMonths: 12,
  sessionMinutes: 15,
  maintenance: false,
  maintenanceMessage: 'We’re upgrading batch verification. Keep your pack — you can check it again shortly.',
  maintenanceUntil: '',
}))

export const SEED_NOTIFICATIONS: Notification[] = mock('SEED_NOTIFICATIONS', () => [
  { id: 'n1', at: ago(16), text: 'Urgent escalation: SR-2026-04817 (unregistered FertiliNova batch)', read: false, roles: ['quality', 'admin'] },
  { id: 'n2', at: ago(5), text: 'New report SR-2026-04821 is unassigned', read: false, roles: ['support', 'admin'] },
  { id: 'n3', at: ago(48), text: 'Lab accreditation for TÜV SÜD Chennai expires within 8 months', read: true, roles: ['admin', 'quality'] },
])

export const HOTSPOTS: Hotspot[] = mock('HOTSPOTS', () => [
  { batch: 'BDL-FN-2501-0001', product: 'FertiliNova', checks7d: 41, checksPrev7d: 6, topChannel: 'Flipkart · WellnessKart', topCity: 'Pune', linkedReports: ['SR-2026-04821', 'SR-2026-04817'] },
  { batch: 'BDL-MB-2311-0099', product: 'MaternaBloom', checks7d: 9, checksPrev7d: 14, topChannel: 'Flipkart · HerbalHub', topCity: 'Mumbai', linkedReports: ['SR-2026-04650'] },
  { batch: 'BDL-FR-2412-0450', product: 'Ferrimune', checks7d: 7, checksPrev7d: 2, topChannel: 'Amazon · NutriDeals', topCity: 'Hyderabad', linkedReports: [] },
])

/** Daily public checks, last 14 days (oldest first), and of those, not found. */
export const LOOKUPS_14D = mock('LOOKUPS_14D', () => [212, 238, 251, 199, 187, 264, 301, 289, 276, 243, 318, 352, 331, 344])
export const NOT_FOUND_14D = mock('NOT_FOUND_14D', () => [6, 4, 9, 5, 3, 7, 12, 8, 6, 5, 14, 19, 11, 13])

/** Not-found checks per product, last 4 weeks (oldest first). */
export const NOT_FOUND_BY_PRODUCT: { product: string; weeks: number[] }[] = mock('NOT_FOUND_BY_PRODUCT', () => [
  { product: 'FertiliNova', weeks: [3, 5, 6, 41] },
  { product: 'MaternaBloom', weeks: [11, 16, 14, 9] },
  { product: 'Ferrimune', weeks: [4, 3, 2, 7] },
  { product: 'PeriHarmon', weeks: [1, 2, 1, 1] },
  { product: 'Cindoria', weeks: [2, 1, 2, 2] },
  { product: 'ProteoDiva', weeks: [0, 1, 0, 1] },
])

export const SERVICE_HEALTH = mock('SERVICE_HEALTH', () => ({ uptime30d: 99.97, p95LookupMs: 182, within48h: 94 }))
