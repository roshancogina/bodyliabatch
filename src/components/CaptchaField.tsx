import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Loader2, RefreshCw } from 'lucide-react'
import {
  CAPTCHA_DIFFICULTY,
  createChallenge,
  describeCaptchaError,
  findSolution,
  isTestBypass,
  buildToken,
  parseToken,
  sha256HexSync,
  buildChallengeText,
  type CaptchaChallenge,
  type CaptchaFailReason,
} from '../lib/captcha'
import { apiBase } from '../lib/bff'
import { IS_PROD_BUILD } from '../lib/runtime-env'
import { cn } from '../lib/utils'

export type CaptchaState =
  | { status: 'solving' }
  | { status: 'ready'; token: string }
  | { status: 'error'; reason: CaptchaFailReason }

const DEV_SECRET = 'batch-bodylia-dev-captcha-NEVER-USE-IN-PROD'

function isBypassed(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
  return isTestBypass({ APP_MODE: env.MODE ?? env.VITE_APP_MODE, BYPASS: env.VITE_CAPTCHA_BYPASS ?? env.CAPTCHA_BYPASS })
}

async function fetchChallenge(base = apiBase()): Promise<CaptchaChallenge | null> {
  // Production portals build with VITE_API_URL="" → same-origin /bff/v1/...
  // (host nginx proxies to the Go service) — the challenge MUST still be
  // fetched from the server there, otherwise the client would self-solve a
  // local dev-secret challenge the API always rejects (HMAC mismatch).
  // Dev/test with an empty base is mock mode: skip the network attempt.
  if (!base && !IS_PROD_BUILD) return null
  try {
    const res = await fetch(`${base}/bff/v1/captcha/challenge`)
    if (!res.ok) return null
    return (await res.json()) as CaptchaChallenge
  } catch {
    return null
  }
}

function tokenFor(challenge: CaptchaChallenge, number: number): string {
  return buildToken({
    algorithm: challenge.algorithm,
    salt: challenge.salt,
    number,
    signature: challenge.signature,
    expiresAt: challenge.expiresAt,
  })
}

/**
 * Self-hosted human check (Altcha-style proof-of-work, no third-party calls).
 * Solves automatically in the background and reports the token via onChange.
 * Test/e2e bypass (VITE_CAPTCHA_BYPASS=1 + MODE=test) emits instantly.
 */
export function CaptchaField({
  id = 'captcha',
  onChange,
  compact,
}: {
  id?: string
  onChange: (token: string | null, state: CaptchaState) => void
  compact?: boolean
}) {
  const [state, setState] = useState<CaptchaState>({ status: 'solving' })
  const runId = useRef(0)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const run = ++runId.current
    setState({ status: 'solving' })
    onChangeRef.current(null, { status: 'solving' })
    let cancelled = false

    const solve = async () => {
      if (isBypassed()) {
        if (!cancelled && run === runId.current) {
          const s: CaptchaState = { status: 'ready', token: 'test-bypass' }
          setState(s)
          onChangeRef.current('test-bypass', s)
        }
        return
      }
      const remote = await fetchChallenge()
      const challenge = remote ?? createChallenge(DEV_SECRET)
      // Chunked brute force: 500 hashes per macrotask keeps the UI responsive.
      let n = 0
      const prefix = '0'.repeat(CAPTCHA_DIFFICULTY)
      const step = (): void => {
        if (cancelled || run !== runId.current) return
        if (challenge.expiresAt <= Date.now()) {
          void solve()
          return
        }
        const end = Math.min(n + 500, challenge.maxNumber)
        for (; n < end; n++) {
          if (sha256HexSync(buildChallengeText(challenge.salt, n)).startsWith(prefix)) {
            if (!cancelled && run === runId.current) {
              const token = tokenFor(challenge, n)
              const s: CaptchaState = { status: 'ready', token }
              setState(s)
              onChangeRef.current(token, s)
            }
            return
          }
        }
        if (n >= challenge.maxNumber) {
          if (!cancelled && run === runId.current) {
            const s: CaptchaState = { status: 'error', reason: 'invalid' }
            setState(s)
            onChangeRef.current(null, s)
          }
          return
        }
        setTimeout(step, 0)
      }
      step()
    }

    void solve()
    return () => {
      cancelled = true
    }
  }, [])

  const retry = () => {
    runId.current += 1
    setState({ status: 'solving' })
    onChange(null, { status: 'solving' })
    void (async () => {
      const expectedRun = runId.current
      const remote = await fetchChallenge()
      const challenge = remote ?? createChallenge(DEV_SECRET)
      const number = findSolution(challenge.salt, challenge.maxNumber)
      if (expectedRun !== runId.current) return
      if (number < 0) {
        const s: CaptchaState = { status: 'error', reason: 'invalid' }
        setState(s)
        onChange(null, s)
        return
      }
      const token = tokenFor(challenge, number)
      const parsed = parseToken(token)
      if (!parsed.ok) {
        const s: CaptchaState = { status: 'error', reason: parsed.reason }
        setState(s)
        onChange(null, s)
        return
      }
      const s: CaptchaState = { status: 'ready', token }
      setState(s)
      onChange(token, s)
    })()
  }

  return (
    <div className={cn(!compact && 'border-t border-mist pt-6')}>
      <div id={id} role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg bg-sand px-4 py-3">
        {state.status === 'ready' && (
          <>
            <ShieldCheck className="size-5 shrink-0 text-success" aria-hidden="true" />
            <p className="text-sm text-graphite">
              Human check passed <span className="text-muted">· runs on this device, nothing to solve</span>
            </p>
          </>
        )}
        {state.status === 'solving' && (
          <>
            <Loader2 className="size-5 shrink-0 animate-spin text-burgundy" aria-hidden="true" />
            <p className="text-sm text-graphite">Running a quick human check…</p>
          </>
        )}
        {state.status === 'error' && (
          <>
            <RefreshCw className="size-5 shrink-0 text-error" aria-hidden="true" />
            <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm font-medium text-error">{describeCaptchaError(state.reason)}</p>
              <button
                type="button"
                onClick={retry}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-burgundy underline underline-offset-4"
              >
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

