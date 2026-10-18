import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthError,
  changePassword,
  clearSession,
  loadSession,
  remoteAuth,
  saveSession,
  signIn,
  verifySecondStep,
} from './auth'
import type { StaffUser } from '../data/admin-seed'

// Production auth paths: forced via the globalThis seam (MODE is 'test' here,
// which would otherwise select the preview auth).

const USER: StaffUser = {
  id: 'p1',
  name: 'Roshan',
  email: 'roshan@bodylia.in',
  role: 'admin',
  status: 'active',
  lastActive: '2026-10-15T00:00:00.000Z',
  mfa: true,
}

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

describe('production auth (Go API)', () => {
  beforeEach(() => {
    ;(globalThis as { __VITE_FORCE_REMOTE_AUTH?: boolean }).__VITE_FORCE_REMOTE_AUTH = true
    ;(globalThis as { sessionStorage?: unknown }).sessionStorage = memoryStorage()
  })
  afterEach(() => {
    delete (globalThis as { __VITE_FORCE_REMOTE_AUTH?: boolean }).__VITE_FORCE_REMOTE_AUTH
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
    vi.unstubAllGlobals()
  })

  it('remoteAuth honours the test seam and defaults to preview otherwise', () => {
    expect(remoteAuth()).toBe(true)
    ;(globalThis as { __VITE_FORCE_REMOTE_AUTH?: boolean }).__VITE_FORCE_REMOTE_AUTH = false
    expect(remoteAuth()).toBe(false)
    delete (globalThis as { __VITE_FORCE_REMOTE_AUTH?: boolean }).__VITE_FORCE_REMOTE_AUTH
    expect(remoteAuth()).toBe(false) // MODE=test → preview auth
  })

  it('signIn posts credentials + captcha and persists the JWT session', async () => {
    const fetchMock = vi.fn(async () =>
      ({ ok: true, status: 200, json: async () => ({ token: 'jwt-abc', user: USER }) }) as Response,
    )
    vi.stubGlobal('fetch', fetchMock)
    const { user } = await signIn('roshan@bodylia.in', 'gloscon10', 'captcha-token')
    expect(user.email).toBe('roshan@bodylia.in')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/api/auth/login')
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'roshan@bodylia.in',
      password: 'gloscon10',
      captchaToken: 'captcha-token',
    })
    expect(loadSession()).toEqual({ token: 'jwt-abc', user: USER })
    clearSession()
    expect(loadSession()).toBeNull()
  })

  it('signIn surfaces the server error on 401 and a reachability error otherwise', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'That email and password do not match a staff account.' }) }) as Response),
    )
    await expect(signIn('x@bodylia.in', 'nope')).rejects.toThrow('That email and password do not match a staff account.')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(signIn('x@bodylia.in', 'nope')).rejects.toThrow('Could not reach the Bodylia API')
  })

  it('changePassword verifies against the API with the session token', async () => {
    saveSession({ token: 'jwt-abc', user: USER })
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    await changePassword('OldPassw0rd!x', 'BrandNewPassw0rd!')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/api/auth/password')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-abc')
    expect(JSON.parse(String(init.body))).toEqual({ current: 'OldPassw0rd!x', password: 'BrandNewPassw0rd!' })
  })

  it('changePassword maps policy/network failures to AuthError', async () => {
    saveSession({ token: 'jwt-abc', user: USER })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'Your new password must be at least 12 characters.' }) }) as Response),
    )
    await expect(changePassword('a', 'b')).rejects.toThrow('Your new password must be at least 12 characters.')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(changePassword('a', 'b')).rejects.toThrow('Could not reach the Bodylia API')
    clearSession()
    await expect(changePassword('a', 'b')).rejects.toThrow('Session expired — sign in again.')
  })

  it('session helpers tolerate broken storage', () => {
    ;(globalThis as { sessionStorage?: unknown }).sessionStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    }
    expect(loadSession()).toBeNull()
    expect(() => saveSession({ token: 't', user: USER })).not.toThrow()
    expect(() => clearSession()).not.toThrow()
  })

  it('second step + preview-only flows refuse in production mode', async () => {
    await expect(verifySecondStep(USER, '123456')).rejects.toThrow(AuthError)
    await expect(verifySecondStep(USER, '123456')).rejects.toThrow('handled at sign-in by the Bodylia API')
  })
})