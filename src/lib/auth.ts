import type { Role, StaffUser } from '../data/admin-seed'
import { store } from './store'

/** Permission matrix — enforced again server-side by the Core API (Book 2 §2). */
export type Permission =
  | 'batches.view'
  | 'batches.register'
  | 'batches.edit'
  | 'batches.recall'
  | 'batches.import'
  | 'reports.view'
  | 'reports.update'
  | 'reports.reply'
  | 'reports.escalate'
  | 'escalations.handle'
  | 'intelligence.view'
  | 'users.manage'
  | 'catalogue.manage'
  | 'settings.manage'
  | 'audit.view'
  | 'audit.export'

const QUALITY: Permission[] = [
  'batches.view', 'batches.register', 'batches.edit', 'batches.recall', 'batches.import',
  'reports.view', 'reports.update', 'reports.reply', 'escalations.handle', 'intelligence.view', 'audit.view',
]
const SUPPORT: Permission[] = ['batches.view', 'reports.view', 'reports.update', 'reports.reply', 'reports.escalate']

export const MATRIX: Record<Role, Permission[]> = {
  admin: [...QUALITY, 'reports.escalate', 'users.manage', 'catalogue.manage', 'settings.manage', 'audit.export'],
  quality: QUALITY,
  support: SUPPORT,
}

export function can(user: StaffUser | null, p: Permission) {
  return !!user && MATRIX[user.role].includes(p)
}

/* ------------------------------------------------------------------ */
/* Mock preview authentication — dev/test ONLY. Throws in production builds.
   Production: Go API session (bcrypt + TOTP server-side). */

import { assertMockAllowed, PREVIEW_AUTH_ENABLED } from './runtime-env'
assertMockAllowed('mock preview auth')

export const PREVIEW_PASSWORD = previewEnv('VITE_PREVIEW_PASSWORD', 'Bodylia@2026')
export const PREVIEW_TOTP = previewEnv('VITE_PREVIEW_TOTP', '246810')
export const PREVIEW_RECOVERY = previewEnv('VITE_PREVIEW_RECOVERY', 'BDLRC-7Q4M-9X2K')
export const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

/**
 * Preview credential resolver. Values come from .env.development in local
 * work, NEVER from committed source. The second arg is a dev-only fallback so
 * a bare checkout still runs; production builds never reach here
 * (assertMockAllowed above throws at module load).
 */
function previewEnv(key: string, devFallback: string): string {
  const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[key]
  if (v) return v
  assertMockAllowed(`preview credential ${key}`)
  return devFallback
}

const passwords = new Map<string, string>()
const attempts = new Map<string, { count: number; lockedUntil?: number }>()
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class AuthError extends Error {
  constructor(message: string, public kind: 'invalid' | 'locked' | 'deactivated' | 'invited' = 'invalid', public lockedUntil?: number) {
    super(message)
  }
}

const findUser = (email: string) => store.get().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())

/** Step 1: password. Returns the user pending 2-step verification. */
export async function signIn(email: string, password: string): Promise<StaffUser> {
  if (!PREVIEW_AUTH_ENABLED) {
    throw new AuthError('Staff sign-in is handled by the Bodylia API in production.')
  }
  await wait(400)
  const key = email.trim().toLowerCase()
  const a = attempts.get(key) ?? { count: 0 }
  if (a.lockedUntil && a.lockedUntil > Date.now()) {
    throw new AuthError('Too many attempts.', 'locked', a.lockedUntil)
  }
  const user = findUser(email)
  const expected = (user && passwords.get(user.email)) ?? PREVIEW_PASSWORD
  if (!user || password !== expected) {
    a.count += 1
    if (a.count >= MAX_ATTEMPTS) {
      a.lockedUntil = Date.now() + LOCK_MINUTES * 60_000
      a.count = 0
      attempts.set(key, a)
      throw new AuthError('Too many attempts.', 'locked', a.lockedUntil)
    }
    attempts.set(key, a)
    const left = MAX_ATTEMPTS - a.count
    throw new AuthError(`That email and password don’t match a staff account. ${left} ${left === 1 ? 'attempt' : 'attempts'} left before a 15-minute lock.`)
  }
  if (user.status === 'deactivated') throw new AuthError('This account has been deactivated. Ask an administrator to restore it.', 'deactivated')
  if (user.status === 'invited') throw new AuthError('This account isn’t active yet. Use the link in your invitation email to set a password.', 'invited')
  attempts.delete(key)
  return user
}

/** Step 2: authenticator code or one-time recovery code. */
export async function verifySecondStep(user: StaffUser, code: string): Promise<StaffUser> {
  if (!PREVIEW_AUTH_ENABLED) {
    throw new AuthError('Verification is handled by the Bodylia API in production.')
  }
  await wait(350)
  const c = code.replace(/\s|-/g, '').toUpperCase()
  if (c !== PREVIEW_TOTP && c !== PREVIEW_RECOVERY.replace(/-/g, '')) {
    throw new AuthError('That code didn’t work. Codes change every 30 seconds — enter the newest one.')
  }
  store.audit(user.name, 'Signed in', user.email, c === PREVIEW_TOTP ? 'Authenticator code' : 'Recovery code used')
  store.set((s) => ({ users: s.users.map((u) => (u.id === user.id ? { ...u, lastActive: new Date().toISOString() } : u)) }))
  return user
}

/** Always resolves the same way, so the page never reveals whether an account exists. */
export async function requestPasswordReset(email: string) {
  await wait(400)
  const u = findUser(email)
  if (u) store.audit('System', 'Password reset requested', u.email)
}

export async function resetPassword(email: string, password: string) {
  await wait(400)
  const u = findUser(email)
  if (u) {
    passwords.set(u.email, password)
    attempts.delete(u.email)
    store.audit(u.name, 'Reset password', u.email)
  }
}

export async function acceptInvitation(email: string, password: string): Promise<StaffUser | undefined> {
  await wait(400)
  const u = findUser(email)
  if (!u) return undefined
  passwords.set(u.email, password)
  return u
}

export function completeMfaSetup(user: StaffUser) {
  store.set((s) => ({ users: s.users.map((u) => (u.id === user.id ? { ...u, mfa: true, status: 'active', lastActive: new Date().toISOString() } : u)) }))
  store.audit(user.name, 'Activated account', user.email, '2-step verification set up')
  return { ...user, mfa: true, status: 'active' as const }
}
