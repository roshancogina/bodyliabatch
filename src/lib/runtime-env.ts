/**
 * Runtime environment for batch.bodylia.in.
 *
 * Data rule: NO dataset, credential, or service URL lives in source.
 * Vite injects VITE_* at build time from .env files (see .env.example);
 * anything secret stays server-side and never ships to the browser.
 *
 * Modes:
 *   development — mock store allowed (VITE_MOCK_DATA=1), preview banner shown.
 *   test        — Playwright: VITE_API_URL points at the Go test service.
 *   production  — API only. Mock data + preview auth are hard-disabled below.
 */
export type AppMode = 'development' | 'test' | 'production'

export const APP_MODE: AppMode = (() => {
  const m = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.MODE
  if (m === 'production') return 'production'
  if (m === 'test') return 'test'
  return 'development'
})()

export const IS_PROD_BUILD = APP_MODE === 'production'

/** Base URL of the Go service. Empty in legacy preview mode (mock store). */
export const API_URL: string =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? '').replace(/\/$/, '')

/** Preview auth affordances (demo codes, seed logins) are dev-only and stripped in prod. */
export const PREVIEW_AUTH_ENABLED = !IS_PROD_BUILD

/**
 * Mock in-memory datasets are ONLY available in non-production builds.
 * Production builds that somehow reach the mock path throw instead of
 * serving fixture data to real customers.
 */
export function assertMockAllowed(caller: string): void {
  if (IS_PROD_BUILD) {
    throw new Error(`[isolation] ${caller}: mock data is disabled in production builds`)
  }
}

/** Dev banner flag for layouts: never render seed/preview hints in prod. */
export const SHOW_PREVIEW_HINTS = !IS_PROD_BUILD
