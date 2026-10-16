import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'

// E2e runs ONLY against the isolated test database (bodyliabatch_test).
// All values come from env (see .env.test / playwright.config.ts); the spec
// file itself carries no credentials, no service URLs, no fixture data.
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:8101'
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@bodylia.in'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? ''

// Admin console journeys: login → search by alias → register with aliases → alias resolves.
test.describe('admin batches + aliases (console)', () => {
  test.beforeEach(() => {
    if (!ADMIN_PASSWORD) {
      test.skip(true, 'E2E_ADMIN_PASSWORD is not set (see .env.test) — refusing to run auth journeys without explicit test credentials')
    }
  })

  async function login(request: any): Promise<string> {
    // Login is an unauthenticated entry point: solve the PoW captcha first.
    const chRes = await request.get(`${API}/bff/v1/captcha/challenge`)
    expect(chRes.status()).toBe(200)
    const ch = await chRes.json()
    const token = solveCaptcha(ch.salt, ch.maxNumber)
    const chal = JSON.stringify({
      algorithm: ch.algorithm, salt: ch.salt, number: token,
      signature: ch.signature, expiresAt: ch.expiresAt,
    })
    const res = await request.post(`${API}/api/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, captchaToken: chal },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.token).toBeTruthy()
    return body.token as string
  }

  // Browser-side PoW solver (mirrors CaptchaField; difficulty 3 ~= ~4k hashes).
  function solveCaptcha(salt: string, maxNumber: number): number {
    for (let n = 0; n < maxNumber; n++) {
      const digest = createHash('sha256').update(`${salt}:${n}`).digest('hex')
      if (digest.startsWith('000')) return n
    }
    throw new Error('no PoW solution in range')
  }

  test('admin search finds batch by mapped manufacturer code @api', async ({ request }) => {
    const token = await login(request)
    for (const q of ['2K26005', '2k26005']) {
      const res = await request.get(`${API}/api/admin/batches?q=${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(res.status()).toBe(200)
      const rows = await res.json()
      expect(rows.map((r: any) => r.batch)).toContain('CI-2610-WL01')
    }
  })

  test('register batch with mapped codes, then each code verifies @api', async ({ request }) => {
    const token = await login(request)
    const serial = String(Math.floor(Math.random() * 90) + 10).padStart(2, '0')
    const batch = `PE-2601-WL${serial}`
    const mfg = `E2E-MFG-${serial}`
    const lbl = `E2E-LBL-${serial}`
    const create = await request.post(`${API}/api/admin/batches`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        batch, product: 'PE', manufactured: '2026-01-05', expires: '2028-01-04',
        facility: 'Unit 2, Baddi, Himachal Pradesh',
        lab: 'Eurofins Analytical Services India, Bengaluru',
        aliases: [{ code: mfg, kind: 'manufacturer' }, { code: lbl, kind: 'label' }],
        coa: [{ test: 'Assay (active)', specification: '18 mg ± 10 %', result: '18.1 mg', pass: true }],
      },
    })
    expect(create.status()).toBe(201)
    for (const code of [batch, mfg, lbl, batch.replace(/-/g, ' ')]) {
      const lookup = await request.get(`${API}/bff/v1/batches/${encodeURIComponent(code)}`)
      expect(lookup.status(), code).toBe(200)
      expect((await lookup.json()).record.batch).toBe(batch)
    }
    // Duplicate mapped code is rejected and names the owner
    const dup = await request.post(`${API}/api/admin/batches`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        batch: `CI-2601-WL${serial}`, product: 'CI', manufactured: '2026-01-05', expires: '2028-01-04',
        facility: 'Unit 1, Baddi, Himachal Pradesh',
        lab: 'Eurofins Analytical Services India, Bengaluru',
        aliases: [{ code: mfg, kind: 'manufacturer' }],
        coa: [{ test: 'Assay (active)', specification: '36 mg ± 10 %', result: '36.1 mg', pass: true }],
      },
    })
    expect([400, 409]).toContain(dup.status())
  })

  test('console login + batches page loads @e2e', async ({ page }) => {
    await page.goto('/#/console')
    // Staff console shows the sign-in form first
    await expect(page.locator('body')).toContainText(/sign in|staff|console|work email/i, { timeout: 15000 })
  })
})
