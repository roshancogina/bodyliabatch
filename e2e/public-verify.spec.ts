import { test, expect } from '@playwright/test'

// Public journeys hit the test API (bodyliabatch_test via Go service).
// Endpoint comes from env; batch codes below are first-batch seed keys
// (migrations/005_first_batch.sql), not fixture data — assertions only
// check verdicts and pack facts, never hardcode product copy.
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:8101'

async function verify(page: any, code: string) {
  await page.goto('/')
  const input = page.locator('form[aria-label="Verify a batch"] input').first()
  await expect(input).toBeVisible({ timeout: 15000 })
  await input.fill(code)
  // Human check solves in the background; wait until it passes before submit.
  await expect(page.getByText(/human check passed/i)).toBeVisible({ timeout: 30000 })
  await page.locator('form[aria-label="Verify a batch"] button[type="submit"]').click()
}

// Public verification journeys against the real Go + Postgres stack.
test.describe('public batch verification (batch.bodylia.in)', () => {
  test('canonical batch verifies genuine @e2e', async ({ page }) => {
    await verify(page, 'PE-2610-WL01')
    await expect(page.getByRole('heading', { name: /genuine bodylia batch/i })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('body')).toContainText('PE-2610-WL01')
    // First-batch pack facts surface on the result page.
    await expect(page.locator('body')).toContainText('1000')
    await expect(page.locator('body')).toContainText('1,399')
  })

  test('manufacturer code resolves to canonical with banner @e2e', async ({ page }) => {
    await verify(page, '2K26001')
    await expect(page.getByRole('heading', { name: /genuine bodylia batch/i })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('body')).toContainText('PE-2610-WL01')
  })

  test('spaces are stripped: spaced input verifies @e2e', async ({ page }) => {
    await verify(page, 'pe 2610 wl01')
    await expect(page.getByRole('heading', { name: /genuine bodylia batch/i })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('body')).toContainText('PE-2610-WL01')
  })

  test('unknown batch shows neutral not-found help @e2e', async ({ page }) => {
    await verify(page, 'ZZ-9999-9Z99')
    await expect(page.getByRole('heading', { name: /couldn’t find this batch/i })).toBeVisible({ timeout: 15000 })
  })

  test('malformed code shows neutral not-found help, not an accusation @e2e', async ({ page }) => {
    await verify(page, 'F-261-0W')
    // Permissive lookup by design: malformed-but-plausible codes reach the
    // neutral not-found page (never a format lecture, never an accusation).
    await expect(page.getByRole('heading', { name: /couldn’t find this batch/i })).toBeVisible({ timeout: 15000 })
  })

  test('custom 404 keeps header/footer with recovery actions @e2e', async ({ page }) => {
    await page.goto('/#/no-such-page')
    await expect(page.getByRole('heading', { name: /doesn’t exist/i })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('header').first()).toBeVisible()
    await expect(page.locator('footer').first()).toBeVisible()
  })

  test('API parity: mapped codes return matchedAlias + kind @api', async ({ request }) => {
    // Playwright boots the API with RATE_LIMIT_PER_MINUTE=120 (test env only,
    // ignored in production), so parity checks need no 429 retry loop.
    for (const code of ['2K26001', '2K26002'] as const) {
      const res = await request.get(`${API}/bff/v1/batches/${code}`)
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body.kind).toBe('genuine')
      expect(body.matchedAlias).toBe(code)
      expect(body.matchedKind).toBe('manufacturer')
    }
  })
})
