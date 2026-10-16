/**
 * Self-hosted proof-of-work captcha (Altcha-style, open source, zero-dependency).
 *
 * No cookies, no third-party calls - GDPR-friendly. Flow:
 *  1. Server (or mock BFF) issues createChallenge(secret) -> salt + expiry +
 *     HMAC signature. The solution number is NEVER sent to the client.
 *  2. The widget brute-forces `number` s.t. SHA-256("salt:number") starts with
 *     DIFFICULTY zero nibbles (chunked async in the browser, sync in tests).
 *  3. verifyCaptcha(token, secret) re-checks HMAC, expiry, and the hash -
 *     the Go backend mirrors this in backend-go/captcha.go.
 *
 * Test bypass exists ONLY for APP_MODE=test + explicit CAPTCHA_BYPASS=1
 * (Playwright fills forms without burning CPU). Never in production.
 */

export const CAPTCHA_ALGORITHM = 'SHA-256' as const
/** Leading zero hex nibbles: 3 ~= ~4k hashes, <300ms desktop, hours for bots at scale. */
export const CAPTCHA_DIFFICULTY = 3
export const CAPTCHA_TTL_MS = 2 * 60_000
export const CAPTCHA_MAX_NUMBER = 100_000

export interface CaptchaChallenge {
  algorithm: typeof CAPTCHA_ALGORITHM
  salt: string
  maxNumber: number
  signature: string
  expiresAt: number
}

export interface CaptchaSolution {
  algorithm: typeof CAPTCHA_ALGORITHM
  salt: string
  number: number
  signature: string
  expiresAt: number
}

export type CaptchaFailReason = 'missing' | 'expired' | 'invalid'

export type CaptchaVerifyResult = { ok: true } | { ok: false; reason: CaptchaFailReason }

/* ------------------------------------------------------------------ */
/* SHA-256 - pure sync TypeScript (deterministic in every runtime).     */
/* ------------------------------------------------------------------ */

function bytesOf(s: string): number[] {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
  }
  return out
}

const SHA_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function sha256HexBytes(msg: number[]): string {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
  const bitLen = msg.length * 8
  const padded = [...msg, 0x80]
  while (padded.length % 64 !== 56) padded.push(0)
  const hi = Math.floor(bitLen / 0x100000000)
  const lo = bitLen >>> 0
  padded.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
    (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let off = 0; off < padded.length; off += 64) {
    const w = new Array<number>(64)
    for (let i = 0; i < 16; i++) {
      w[i] = ((padded[off + i * 4] << 24) | (padded[off + i * 4 + 1] << 16) | (padded[off + i * 4 + 2] << 8) | padded[off + i * 4 + 3]) | 0
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) | 0
      const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) | 0
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) | 0
      const ch = ((e & f) ^ (~e & g)) | 0
      const t1 = (h + S1 + ch + SHA_K[i] + w[i]) | 0
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) | 0
      const maj = ((a & b) ^ (a & c) ^ (b & c)) | 0
      const t2 = (S0 + maj) | 0
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('')
}

export function sha256HexSync(text: string): string {
  return sha256HexBytes(bytesOf(text))
}

function hexBytes(hex: string): number[] {
  const out: number[] = []
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16))
  return out
}

/** HMAC-SHA256 hex(secret, data) - pure TS so server and tests agree exactly. */
export function hmacHex(secret: string, data: string): string {
  const block = 64
  let key = bytesOf(secret)
  if (key.length > block) key = hexBytes(sha256HexSync(secret))
  while (key.length < block) key.push(0)
  const oKey = key.map((b) => b ^ 0x5c)
  const iKey = key.map((b) => b ^ 0x36)
  const inner = hexBytes(sha256HexBytes([...iKey, ...bytesOf(data)]))
  return sha256HexBytes([...oKey, ...inner])
}

/* ------------------------------------------------------------------ */
/* Challenge lifecycle.                                                */
/* ------------------------------------------------------------------ */

export function buildChallengeText(salt: string, number: number): string {
  return `${salt}:${number}`
}

export function signChallenge(secret: string, salt: string, expiresAt: number): string {
  return hmacHex(secret, `${salt}|${expiresAt}`)
}

function randomHex(bytes: number): string {
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }
  const buf = new Uint8Array(bytes)
  if (g.crypto?.getRandomValues) g.crypto.getRandomValues(buf)
  else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256)
  return Array.from(buf).map((x) => x.toString(16).padStart(2, '0')).join('')
}

/**
 * Server-side challenge. The solution number is NEVER included - the client
 * must brute-force it. Signature binds salt + expiry to the server secret.
 */
export function createChallenge(
  secret: string,
  opts?: { salt?: string; ttlMs?: number; now?: number; maxNumber?: number },
): CaptchaChallenge {
  const now = opts?.now ?? Date.now()
  const ttlMs = opts?.ttlMs ?? CAPTCHA_TTL_MS
  const maxNumber = opts?.maxNumber ?? CAPTCHA_MAX_NUMBER
  const salt = opts?.salt ?? randomHex(16)
  const expiresAt = now + ttlMs
  return { algorithm: CAPTCHA_ALGORITHM, salt, maxNumber, signature: signChallenge(secret, salt, expiresAt), expiresAt }
}

/** Sync solver (tests / mock BFF). The browser widget runs this chunked-async. */
export function solveChallenge(
  c: CaptchaChallenge,
  opts?: { difficulty?: number },
): { payload: CaptchaSolution; token: string } {
  const number = findSolution(c.salt, c.maxNumber, opts?.difficulty ?? CAPTCHA_DIFFICULTY)
  if (number < 0) throw new Error('[captcha] no solution in range - increase maxNumber')
  const payload: CaptchaSolution = { algorithm: c.algorithm, salt: c.salt, number, signature: c.signature, expiresAt: c.expiresAt }
  return { payload, token: buildToken(payload) }
}

export function findSolution(salt: string, maxNumber: number, difficulty = CAPTCHA_DIFFICULTY): number {
  const prefix = '0'.repeat(difficulty)
  for (let n = 0; n < maxNumber; n++) {
    if (sha256HexSync(buildChallengeText(salt, n)).startsWith(prefix)) return n
  }
  return -1
}

export function buildToken(p: CaptchaSolution): string {
  return JSON.stringify({ algorithm: p.algorithm, salt: p.salt, number: p.number, signature: p.signature, expiresAt: p.expiresAt })
}

export function parseToken(raw: string): { ok: true; payload: CaptchaSolution } | { ok: false; reason: CaptchaFailReason } {
  if (!raw) return { ok: false, reason: 'missing' }
  try {
    const p = JSON.parse(raw) as Partial<CaptchaSolution>
    if (p.algorithm !== CAPTCHA_ALGORITHM || typeof p.salt !== 'string' || typeof p.number !== 'number' || typeof p.signature !== 'string' || typeof p.expiresAt !== 'number') {
      return { ok: false, reason: 'invalid' }
    }
    return { ok: true, payload: p as CaptchaSolution }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}

export function verifyCaptcha(token: string, secret: string, opts?: { now?: number; difficulty?: number }): CaptchaVerifyResult {
  const parsed = parseToken(token)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }
  const p = parsed.payload
  const now = opts?.now ?? Date.now()
  if (p.expiresAt <= now) return { ok: false, reason: 'expired' }
  if (signChallenge(secret, p.salt, p.expiresAt) !== p.signature) return { ok: false, reason: 'invalid' }
  // Range before PoW (mirrors backend-go/captcha.go): cheap reject, no hash burn.
  if (p.number < 0 || p.number >= CAPTCHA_MAX_NUMBER) return { ok: false, reason: 'invalid' }
  const digest = sha256HexSync(buildChallengeText(p.salt, p.number))
  if (!digest.startsWith('0'.repeat(opts?.difficulty ?? CAPTCHA_DIFFICULTY))) return { ok: false, reason: 'invalid' }
  return { ok: true }
}

/* ------------------------------------------------------------------ */
/* Policy helpers (env-driven, no secrets in source).                  */
/* ------------------------------------------------------------------ */

export interface CaptchaEnv {
  APP_MODE?: string
  BYPASS?: string
}

/** Test bypass ONLY when the runner is in test mode AND explicitly flagged. */
export function isTestBypass(env: CaptchaEnv): boolean {
  return env.APP_MODE === 'test' && env.BYPASS === '1'
}

export function isCaptchaRequired(env: CaptchaEnv): boolean {
  return !isTestBypass(env)
}

/** Plain-language error copy for form UI. */
export function describeCaptchaError(reason: CaptchaFailReason): string {
  if (reason === 'expired') return 'The security check expired - it refreshes automatically, just try again.'
  if (reason === 'missing') return 'Please complete the human check before submitting.'
  return 'We could not confirm you are human - please try the check again.'
}

/** Solved PoW earns N attempts in the window (rate-limit escape hatch). */
export function maxAttemptsFor(windowMs: number): number {
  if (windowMs <= 0) return 0
  return Math.max(1, Math.floor(windowMs / 10_000))
}
