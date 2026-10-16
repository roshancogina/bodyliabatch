import type { Role, StaffUser } from '../data/admin-seed'
import { apiBase } from './bff'

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

export class AuthError extends Error {
  constructor(message: string, public kind: 'invalid' | 'locked' | 'deactivated' | 'invited' = 'invalid', public lockedUntil?: number) {
    super(message)
  }
}

/* ------------------------------------------------------------------ */
/* Preview credential values — dev/test only, EMPTY STRINGS in production.
   This module must never throw at load time: SignIn imports it in prod. */
function previewEnv(key: string): string {
  return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[key]) ?? ''
}
export const PREVIEW_PASSWORD = previewEnv('VITE_PREVIEW_PASSWORD')
export const PREVIEW_TOTP = previewEnv('VITE_PREVIEW_TOTP')
export const PREVIEW_RECOVERY = previewEnv('VITE_PREVIEW_RECOVERY')
export const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

const passwords = new Map<string, string>()
const attempts = new Map<string, { count: number; lockedUntil?: number }>()
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ */
/* Production session — JWT + user, persisted per browser tab.          */

const SESSION_KEY = 'bodylia.staff.session'
export interface StaffSession {
  token: string
  user: StaffUser
}

export function saveSession(s: StaffSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    /* storage disabled — the session simply won't survive reloads */
  }
}

export function loadSession(): StaffSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as StaffSession) : null
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * True when auth talks to the Go API. Production builds ALWAYS do (the
 * globalThis stub lets tests exercise the remote paths without rebuilding);
 * other builds default to the in-memory preview auth.
 */
export function remoteAuth(): boolean {
  const stubbed = (globalThis as { __VITE_FORCE_REMOTE_AUTH?: boolean }).__VITE_FORCE_REMOTE_AUTH
  if (stubbed !== undefined) return stubbed
  const mode = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.MODE
  return mode === 'production'
}

/** POST JSON to the API (same-origin in production); non-2xx → thrown `error`. */
async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) {
    const err = new Error(data.error ?? `Request failed (${res.status})`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return data as T
}

/* ------------------------------------------------------------------ */
/* Preview authentication — dev/test ONLY. The mock store loads via
   dynamic import so this module never evaluates fixtures at load time. */

async function findUser(email: string): Promise<StaffUser | undefined> {
  const { store } = await import('./store')
  return store.get().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
}

/** Step 1: password. Production → Go API (captcha + bcrypt + JWT session);
 *    preview → in-memory account check pending 2-step verification. */
export async function signIn(email: string, password: string, captchaToken?: string): Promise<StaffUser> {
  if (remoteAuth()) {
    try {
      const out = await apiPost<{ token: string; user: StaffUser }>('/api/auth/login', {
        email,
        password,
        captchaToken: captchaToken ?? '',
      })
      saveSession({ token: out.token, user: out.user })
      return out.user
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status === 401 || status === 403) throw new AuthError((e as Error).message)
      throw new AuthError('Could not reach the Bodylia API. Try again in a moment.')
    }
  }
  await wait(400)
  const key = email.trim().toLowerCase()
  const a = attempts.get(key) ?? { count: 0 }
  if (a.lockedUntil && a.lockedUntil > Date.now()) {
    throw new AuthError('Too many attempts.', 'locked', a.lockedUntil)
  }
  const user = await findUser(email)
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

/** Step 2 (preview only): authenticator code or one-time recovery code.
 *    Production issues the session at login — the API has no TOTP step yet. */
export async function verifySecondStep(user: StaffUser, code: string): Promise<StaffUser> {
  if (remoteAuth()) {
    throw new AuthError('Verification is handled at sign-in by the Bodylia API.')
  }
  await wait(350)
  const c = code.replace(/\s|-/g, '').toUpperCase()
  if (c !== PREVIEW_TOTP && c !== PREVIEW_RECOVERY.replace(/-/g, '')) {
    throw new AuthError('That code didn’t work. Codes change every 30 seconds — enter the newest one.')
  }
  const { store } = await import('./store')
  store.audit(user.name, 'Signed in', user.email, c === PREVIEW_TOTP ? 'Authenticator code' : 'Recovery code used')
  store.set((s) => ({ users: s.users.map((u) => (u.id === user.id ? { ...u, lastActive: new Date().toISOString() } : u)) }))
  return user
}

/** Change your own password. Production → POST /api/auth/password (Bearer JWT;
 *    the server verifies the current hash and enforces the password policy).
 *    Preview → compares against the preview credential. */
export async function changePassword(current: string, next: string): Promise<void> {
  if (!remoteAuth()) {
    if (current !== PREVIEW_PASSWORD) throw new AuthError('That isn’t your current password.')
    return
  }
  const session = loadSession()
  if (!session) throw new AuthError('Session expired — sign in again.')
  try {
    await apiPost<{ ok: boolean }>('/api/auth/password', { current, password: next }, session.token)
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 400 || status === 401) throw new AuthError((e as Error).message)
    throw new AuthError('Could not reach the Bodylia API. Try again in a moment.')
  }
}

/** Always resolves the same way, so the page never reveals whether an account exists. */
export async function requestPasswordReset(email: string) {
  if (remoteAuth()) throw new AuthError('Password resets are handled by an administrator — ask them for a new invitation.')
  await wait(400)
  const u = await findUser(email)
  if (u) {
    const { store } = await import('./store')
    store.audit('System', 'Password reset requested', u.email)
  }
}

export async function resetPassword(email: string, password: string) {
  if (remoteAuth()) throw new AuthError('Password resets are handled by an administrator — ask them for a new invitation.')
  await wait(400)
  const u = await findUser(email)
  if (u) {
    passwords.set(u.email, password)
    attempts.delete(u.email)
    const { store } = await import('./store')
    store.audit(u.name, 'Reset password', u.email)
  }
}

export async function acceptInvitation(email: string, password: string): Promise<StaffUser | undefined> {
  if (remoteAuth()) throw new AuthError('Invitations are handled by an administrator.')
  await wait(400)
  const u = await findUser(email)
  if (!u) return undefined
  passwords.set(u.email, password)
  return u
}

export function completeMfaSetup(user: StaffUser) {
  if (remoteAuth()) throw new AuthError('2-step setup is handled by the Bodylia API in production.')
  void import('./store').then(({ store }) => {
    store.set((s) => ({ users: s.users.map((u) => (u.id === user.id ? { ...u, mfa: true, status: 'active', lastActive: new Date().toISOString() } : u)) }))
    store.audit(user.name, 'Activated account', user.email, '2-step verification set up')
  })
  return { ...user, mfa: true, status: 'active' as const }
}
