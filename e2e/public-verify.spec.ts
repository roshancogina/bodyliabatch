import { test, expect } from '@playwright/test'

// Public journeys hit the test API (bodyliabatch_test via Go service).
// Endpoint comes from env; batch codes below are canonical seed keys
// (migrations/002_*), not fixture data — assertions only check verdicts.
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:8101'

async function verify(page: any, code: string) {
  await page.goto('/')
  const input = page.locator('form[aria-label="Verify a batch"] input').first()
  await expect(input).toBeVisible({ timeout: 15000 })
  await input.fill(code)
  await page.locator('form[aria-label="Verify a batch"] button[type="submit"]').click()
}

// Public verification journeys against the real Go + Postgres stack.
test.describe('public batch verification (batch.bodylia.in)', () => {
  test('canonical batch verifies genuine @e2e', async ({ page }) => {
    await verify(page, 'BDL-FR-2509-0312')
    await expect(page.getByRole('heading', { name: /genuine bodylia batch/i })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('body')).toContainText('BDL-FR-2509-0312')
  })

  test('vendor alias resolves to canonical with banner @e2e', async ({ page }) => {
    await verify(page, 'FR-2509-312')
    await expect(page.getByRole('heading', { name: /genuine bodylia batch/i })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('body')).toContainText('BDL-FR-2509-0312')
  })

  test('recalled batch shows recall verdict @e2e', async ({ page }) => {
    await verify(page, 'BDL-PH-2504-0777')
    await expect(page.getByRole('heading', { name: /has been recalled/i })).toBeVisible({ timeout: 15000 })
  })

  test('unknown batch shows neutral not-found help @e2e', async ({ page }) => {
    await verify(page, 'BDL-FN-2501-0001')
    await expect(page.getByRole('heading', { name: /couldn’t find this batch/i })).toBeVisible({ timeout: 15000 })
  })

  test('API parity: alias lookup returns matchedAlias @api', async ({ request }) => {
    const res = await request.get(`${API}/bff/v1/batches/FR-2509-312`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.kind).toBe('genuine')
    expect(body.record.batch).toBe('BDL-FR-2509-0312')
    expect(body.matchedAlias).toBeTruthy()
  })
})
