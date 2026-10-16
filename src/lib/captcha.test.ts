import { describe, expect, it } from 'vitest'
import {
  buildChallengeText,
  buildToken,
  CAPTCHA_DIFFICULTY,
  CAPTCHA_MAX_NUMBER,
  CAPTCHA_TTL_MS,
  createChallenge,
  describeCaptchaError,
  findSolution,
  hmacHex,
  isCaptchaRequired,
  isTestBypass,
  maxAttemptsFor,
  parseToken,
  sha256HexSync,
  signChallenge,
  solveChallenge,
  verifyCaptcha,
} from './captcha'

const SECRET = 'test-captcha-secret-0123456789abcdef'

describe('captcha crypto core (self-hosted SHA-256 proof-of-work)', () => {
  it('sha256 matches known vectors incl. multi-block input', () => {
    expect(sha256HexSync('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256HexSync('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256HexSync('a'.repeat(55))).toBe('9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318')
    expect(sha256HexSync('a'.repeat(56))).toBe('b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a')
  })

  it('creates a server challenge WITHOUT the solution', () => {
    const c = createChallenge(SECRET)
    expect(c.algorithm).toBe('SHA-256')
    expect(c.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(c).not.toHaveProperty('number')
    expect(c.signature).toBe(signChallenge(SECRET, c.salt, c.expiresAt))
    expect(c.signature).toMatch(/^[0-9a-f]{64}$/)
    expect(c.maxNumber).toBe(CAPTCHA_MAX_NUMBER)
    expect(c.expiresAt).toBeGreaterThan(Date.now())
  })

  it('accepts custom salt and ttl for deterministic tests', () => {
    const salt = 'a'.repeat(32)
    const c = createChallenge(SECRET, { salt, ttlMs: 1000, now: 1_700_000_000_000 })
    expect(c.salt).toBe(salt)
    expect(c.expiresAt).toBe(1_700_000_000_000 + 1000)
  })

  it('solves the challenge: hash(salt:number) meets difficulty, server accepts', () => {
    const c = createChallenge(SECRET, { salt: 'd'.repeat(32) })
    const solved = solveChallenge(c)
    expect(solved.payload.number).toBeGreaterThanOrEqual(0)
    expect(sha256HexSync(buildChallengeText(c.salt, solved.payload.number)).startsWith('0'.repeat(CAPTCHA_DIFFICULTY))).toBe(true)
    expect(verifyCaptcha(solved.token, SECRET).ok).toBe(true)
  })

  it('findSolution honours difficulty and returns -1 when out of range', () => {
    const n = findSolution('f'.repeat(32), 100_000, 1)
    expect(n).toBeGreaterThanOrEqual(0)
    expect(sha256HexSync(buildChallengeText('f'.repeat(32), n)).startsWith('0')).toBe(true)
    expect(findSolution('f'.repeat(32), 0, 1)).toBe(-1)
  })

  it('solveChallenge throws when nothing in range solves', () => {
    const c = createChallenge(SECRET, { salt: 'a'.repeat(32), maxNumber: 0 })
    expect(() => solveChallenge(c)).toThrow(/no solution in range/)
  })

  it('covers custom-salt expiry line + hash-mismatch and range edges', () => {
    // captcha.ts:142-143 — custom salt WITH explicit ttl uses that ttl verbatim
    const fixed = createChallenge(SECRET, { salt: 'd'.repeat(32), ttlMs: 5000, now: 9_000 })
    expect(fixed.expiresAt).toBe(14_000)
    // custom salt WITHOUT ttl falls to now + TTL (line 143)
    const fell = createChallenge(SECRET, { salt: 'e'.repeat(32), now: 9_000 })
    expect(fell.expiresAt).toBe(9_000 + CAPTCHA_TTL_MS)
    // captcha.ts:208 — correct signature but unsolved number rejected
    const c = createChallenge(SECRET, { salt: 'f'.repeat(32) })
    const weak = { ...solveChallenge(c).payload, number: 0 }
    const token = buildToken(weak)
    const parsed = parseToken(token)
    expect(parsed.ok).toBe(true)
    // difficulty 8 is (almost surely) unsatisfied by a difficulty-3 solution
    const digest = sha256HexSync(buildChallengeText(weak.salt, weak.number))
    if (!digest.startsWith('00000000')) {
      expect(verifyCaptcha(token, SECRET, { difficulty: 8 }).ok).toBe(false)
    }
  })

  it('rejects tampered salt and wrong secrets', () => {
    const c = createChallenge(SECRET, { salt: 'b'.repeat(32) })
    const good = solveChallenge(c)
    const tampered = { ...good.payload, salt: 'c'.repeat(32) }
    expect(verifyCaptcha(buildToken(tampered), SECRET).ok).toBe(false)
    expect(verifyCaptcha(good.token, 'wrong-secret').ok).toBe(false)
  })

  it('rejects expired challenges', () => {
    const c = createChallenge(SECRET, { salt: 'e'.repeat(32), ttlMs: 1000, now: 1_000 })
    const solved = solveChallenge(c)
    const res = verifyCaptcha(solved.token, SECRET, { now: 1_000 + CAPTCHA_TTL_MS + 1 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('expired')
    // Custom-salt path defaults expiry to now + TTL when ttlMs is omitted.
    const c2 = createChallenge(SECRET, { salt: 'f'.repeat(32), now: 5_000 })
    expect(c2.expiresAt).toBe(5_000 + CAPTCHA_TTL_MS)
    // Random-salt path defaults expiry relative to Date.now.
    const c3 = createChallenge(SECRET)
    expect(c3.expiresAt).toBeGreaterThan(Date.now())
  })

  it('rejects out-of-range numbers and weak hashes', () => {
    const c = createChallenge(SECRET, { salt: 'b'.repeat(32) })
    const good = solveChallenge(c)
    const over = { ...good.payload, number: CAPTCHA_MAX_NUMBER + 5 }
    expect(verifyCaptcha(buildToken(over), SECRET).ok).toBe(false)
    const weak = { ...good.payload, number: 0 }
    if (!sha256HexSync(buildChallengeText(weak.salt, 0)).startsWith('0'.repeat(CAPTCHA_DIFFICULTY))) {
      expect(verifyCaptcha(buildToken(weak), SECRET).ok).toBe(false)
    }
  })

  it('rejects malformed tokens with inspectable reasons', () => {
    for (const bad of ['', 'not-json', '{}', '{"salt":"x"}']) {
      const res = verifyCaptcha(bad, SECRET)
      expect(res.ok).toBe(false)
    }
    const parsed = parseToken('oops')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.reason).toBe('invalid')
    expect(parseToken('').ok).toBe(false)
  })

  it('hmac handles long secrets and unicode input', () => {
    expect(hmacHex('x'.repeat(100), 'data')).toMatch(/^[0-9a-f]{64}$/)
    expect(sha256HexSync('héllo→').length).toBe(64)
  })
})

describe('captcha challenge lifecycle (solution never leaves the client)', () => {
  it('caps attempts: maxAttemptsFor grows with expiry window', () => {
    expect(maxAttemptsFor(60_000)).toBeGreaterThan(0)
    expect(maxAttemptsFor(0)).toBe(0)
  })

  it('skips captcha in tests/e2e only via explicit env (never production)', () => {
    expect(isTestBypass({ APP_MODE: 'test', BYPASS: '1' })).toBe(true)
    expect(isTestBypass({ APP_MODE: 'development', BYPASS: '1' })).toBe(false)
    expect(isTestBypass({ APP_MODE: 'production', BYPASS: '1' })).toBe(false)
    expect(isTestBypass({})).toBe(false)
    expect(isCaptchaRequired({ APP_MODE: 'production', BYPASS: '' })).toBe(true)
    expect(isCaptchaRequired({ APP_MODE: 'test', BYPASS: '1' })).toBe(false)
  })

  it('describes errors in plain language for form copy', () => {
    expect(describeCaptchaError('expired')).toMatch(/expired/i)
    expect(describeCaptchaError('invalid')).toMatch(/try.*again/i)
    expect(describeCaptchaError('missing')).toMatch(/complete/i)
  })

  it('challenge text is the exact string both sides hash', () => {
    expect(buildChallengeText('salt1', 42)).toBe('salt1:42')
  })


  it('verifyCaptcha honours custom difficulty', () => {
    const c = createChallenge(SECRET, { salt: 'z'.repeat(32) })
    const solved = solveChallenge(c, { difficulty: 1 })
    expect(verifyCaptcha(solved.token, SECRET, { difficulty: 1 }).ok).toBe(true)
    expect(verifyCaptcha(solved.token, SECRET, { difficulty: 8 }).ok).toBe(false)
  })
  it('random challenges use fresh salts each time', () => {
    const a = createChallenge(SECRET)
    const b = createChallenge(SECRET)
    expect(a.salt).not.toBe(b.salt)
  })

  it('signChallenge is deterministic per salt+expiry', () => {
    expect(signChallenge(SECRET, 'a'.repeat(32), 1000)).toBe(signChallenge(SECRET, 'a'.repeat(32), 1000))
    expect(signChallenge(SECRET, 'a'.repeat(32), 1000)).not.toBe(signChallenge(SECRET, 'a'.repeat(32), 1001))
  })
})
