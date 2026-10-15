import { useRef, useSyncExternalStore } from 'react'
import { BATCHES, type BatchRecord } from '../data/batches'
import { PRODUCTS, type Product } from '../data/products'
import { assertMockAllowed } from './runtime-env'
import {
  SEED_AUDIT,
  SEED_FACILITIES,
  SEED_LABS,
  SEED_NOTIFICATIONS,
  SEED_REPORTS,
  SEED_SETTINGS,
  SEED_USERS,
  type AuditEvent,
  type Notification,
  type Settings,
  type Site,
  type StaffUser,
  type SuspiciousReport,
  type TimelineEvent,
} from '../data/admin-seed'

/**
 * In-memory mock store — dev/test ONLY (asserted in fixture modules AND here).
 * Production builds throw at module load: the only data source in prod is the
 * Go API (VITE_API_URL), backed by Postgres. There is deliberately no code path
 * that hydrates this store from the network — remote mode bypasses it entirely
 * (see bff.ts lookupBatch → remoteLookup).
 */
assertMockAllowed('mock store')
export interface Feedback {
  at: string
  batch: string
  helpful: boolean
  comment?: string
}

export interface State {
  batches: BatchRecord[]
  products: Product[]
  facilities: Site[]
  labs: Site[]
  reports: SuspiciousReport[]
  users: StaffUser[]
  audit: AuditEvent[]
  settings: Settings
  notifications: Notification[]
  feedback: Feedback[]
}

let state: State = {
  batches: [...BATCHES],
  products: Object.values(PRODUCTS),
  facilities: [...SEED_FACILITIES],
  labs: [...SEED_LABS],
  reports: [...SEED_REPORTS],
  users: [...SEED_USERS],
  audit: [...SEED_AUDIT],
  settings: { ...SEED_SETTINGS },
  notifications: [...SEED_NOTIFICATIONS],
  feedback: [],
}

const listeners = new Set<() => void>()

export const store = {
  get: () => state,
  set(updater: (s: State) => Partial<State>) {
    state = { ...state, ...updater(state) }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
  audit(actor: string, action: string, target: string, detail?: string) {
    store.set((s) => ({
      audit: [{ id: `a${Date.now()}${Math.random()}`, at: new Date().toISOString(), actor, action, target, detail }, ...s.audit],
    }))
  },
  /** Update one report and append a timeline event in one write. */
  updateReport(reference: string, patch: Partial<SuspiciousReport>, event?: Omit<TimelineEvent, 'at'>) {
    store.set((s) => ({
      reports: s.reports.map((r) =>
        r.reference === reference
          ? { ...r, ...patch, timeline: event ? [...r.timeline, { ...event, at: new Date().toISOString() }] : r.timeline }
          : r,
      ),
    }))
  },
  notify(text: string, roles: Notification['roles']) {
    store.set((s) => ({
      notifications: [{ id: `n${Date.now()}`, at: new Date().toISOString(), text, read: false, roles }, ...s.notifications],
    }))
  },
}

/**
 * Selectors often derive arrays (`s.reports.filter(...)`). useSyncExternalStore requires a
 * stable snapshot, otherwise React re-renders forever (white screen). We return the previous
 * result whenever the new one is shallow-equal to it.
 */
export function useStore<T>(selector: (s: State) => T): T {
  const last = useRef<{ value: T } | null>(null)
  const getSnapshot = () => {
    const next = selector(state)
    if (last.current && shallowEqual(last.current.value, next)) return last.current.value
    last.current = { value: next }
    return next
  }
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  return false
}
