import { describe, expect, it } from 'vitest'
import { createChallenge, hmacHex, sha256HexSync } from './captcha'

const SECRET = 'test-captcha-secret-0123456789abcdef'

describe('captcha coverage edges', () => {
  it('randomHex falls back to Math.random without WebCrypto', () => {
    const g = globalThis as { crypto?: unknown }
    const saved = g.crypto
    try {
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
      // 32 hex chars from the Math.random path (line 143)
      const c = createChallenge(SECRET)
      expect(c.salt).toMatch(/^[0-9a-f]{32}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true })
    }
  })

  it('hmacHex pads single-digit bytes', () => {
    // Forces the padStart branch with a key that yields < 0x10 bytes
    expect(hmacHex('', '')).toMatch(/^[0-9a-f]{64}$/)
    expect(sha256HexSync('pad').length).toBe(64)
  })
})
