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
    await expect(page.getByRole('button', { name: /download certificate/i })).toBeVisible()
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

  test('public certificate of analysis download is available for any batch @api', async ({ request }) => {
    for (const batch of ['PE-2610-WL01', 'FE-2610-WL01', 'CI-2610-WL01']) {
      const res = await request.get(`${API}/bff/v1/batches/${batch}/coa`)
      expect(res.status()).toBe(200)
      expect(res.headers()['content-type']).toContain('application/pdf')
      const body = await res.body()
      expect(body.length).toBeGreaterThan(100)
      expect(body.toString('utf-8', 0, 5)).toBe('%PDF-')
    }
  })

  test('file a batch issue report with purchase verification and track status @e2e', async ({ page }) => {
    await page.goto('/')
    // Header navigation link
    await page.getByRole('link', { name: /report an issue/i }).first().click()
    await expect(page.getByRole('heading', { name: /report a batch issue/i })).toBeVisible({ timeout: 15000 })

    // Step 1: Batch & purchase verification
    await page.locator('#batch').fill('PE-2610-WL01')
    await page.getByRole('button', { name: /verify batch/i }).click()
    await expect(page.getByText(/batch verified genuine/i)).toBeVisible({ timeout: 15000 })

    await page.locator('#channel').selectOption({ label: 'Amazon' })
    await page.locator('#orderNumber').fill('OD-402-1234567')
    await page.locator('#purchaseDate').fill('2026-10-15')

    // Step 2: Issue details
    await page.locator('#message').fill('The safety seal was broken and two capsules were crushed on delivery.')

    // Step 3: Contact details
    await page.locator('#fullName').fill('Priya Sharma')
    await page.locator('#email').fill('priya.customer@bodylia.in')
    await page.locator('#phone').fill('+91 98765 43210')
    await page.locator('#consent').check()

    // PoW captcha check
    await expect(page.getByText(/human check passed/i)).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: /send report/i }).click()

    // Confirmation screen
    await expect(page.getByRole('heading', { name: /thank you — report received/i })).toBeVisible({ timeout: 15000 })
    const refElement = page.locator('strong.tabular').first()
    await expect(refElement).toBeVisible()
    const refText = await refElement.innerText()
    expect(refText).toMatch(/^SR-\d{4}-\d{5}$/)

    // Track button navigates to track page with reference prefilled
    await page.getByRole('button', { name: /track this report/i }).click()
    await expect(page.getByRole('heading', { name: /track a report/i })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#tr-ref')).toHaveValue(refText)
  })
})
