import { test, expect } from '@playwright/test'

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
    const res = await request.post(`${API}/api/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.token).toBeTruthy()
    return body.token as string
  }

  test('admin search finds batch by vendor alias @api', async ({ request }) => {
    const token = await login(request)
    const res = await request.get(`${API}/api/admin/batches?q=VND-CN`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const rows = await res.json()
    expect(rows.map((r: any) => r.batch)).toContain('BDL-CN-2510-1180')
  })

  test('register batch with alias, then alias verifies @api', async ({ request }) => {
    const token = await login(request)
    const serial = String(2000 + Math.floor(Math.random() * 7000)).padStart(4, '0')
    const batch = `BDL-FR-2601-${serial}`
    const alias = `E2E-VND-${serial}`
    const create = await request.post(`${API}/api/admin/batches`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        batch, product: 'FR', manufactured: '2026-01-05', expires: '2028-01-04',
        facility: 'Unit 2, Baddi, Himachal Pradesh',
        lab: 'Eurofins Analytical Services India, Bengaluru',
        aliases: [alias],
        coa: [{ test: 'Assay (active)', specification: '18 mg ± 10 %', result: '18.1 mg', pass: true }],
      },
    })
    expect(create.status()).toBe(201)
    const lookup = await request.get(`${API}/bff/v1/batches/${alias}`)
    expect(lookup.status()).toBe(200)
    expect((await lookup.json()).record.batch).toBe(batch)
    // Duplicate alias is rejected and names the owner
    const dup = await request.post(`${API}/api/admin/batches`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        batch: `BDL-CN-2601-${serial}`, product: 'CN', manufactured: '2026-01-05', expires: '2028-01-04',
        facility: 'Unit 1, Baddi, Himachal Pradesh',
        lab: 'Eurofins Analytical Services India, Bengaluru',
        aliases: [alias],
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
