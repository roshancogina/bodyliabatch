import { apiBase } from '../lib/bff'
import { loadSession } from '../lib/auth'

/**
 * Shared API helper for the PRODUCTION staff console (ProdShell + its tabs).
 * Prod-safe by construction: only bff/auth imports — never lib/store or
 * src/data fixtures (those assert at module load in production builds).
 * All requests are same-origin via the host nginx with the Bearer JWT
 * session from sessionStorage.
 */
export class AuthExpired extends Error {
  constructor() {
    super('Session expired — sign in again.')
  }
}

export async function adminApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const session = loadSession()
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
  const headers: Record<string, string> = {
    ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
  }
  if (!isFormData) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${apiBase()}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: isFormData ? (init.body as FormData) : init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  if (res.status === 401) throw new AuthExpired()
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
  return data as T
}
