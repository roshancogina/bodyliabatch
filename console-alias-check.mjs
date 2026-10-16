import { chromium } from '@playwright/test'

// Live validation of admin alias management on the production console:
// sign in → find a batch by canonical code → map a vendor code → the public
// lookup resolves through it → remove the alias → public lookup stops.
const BASE = process.argv[2] ?? 'https://batch.bodylia.in'
const EMAIL = process.env.CHECK_EMAIL ?? 'roshan@bodylia.in'
const PASSWORD = process.env.CHECK_PASSWORD ?? 'gloscon10'
const BATCH = 'PE-2610-WL01'
const ALIAS = 'LIVECK2610'

const browser = await chromium.launch()
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

const step = (msg) => console.log(`• ${msg}`)
const fail = async (msg) => {
  console.error(`✗ ${msg}`)
  console.error('page errors:', pageErrors)
  await page.screenshot({ path: '/tmp/alias-check-fail.png', fullPage: true }).catch(() => {})
  await browser.close()
  process.exit(1)
}

await page.goto(`${BASE}/#/console`, { waitUntil: 'load', timeout: 30_000 })
await page.waitForTimeout(1_500)
await page.fill('input[autocomplete="username"]', EMAIL)
await page.fill('input[autocomplete="current-password"]', PASSWORD)
await page.waitForTimeout(2_500)
await page.getByRole('button', { name: /continue/i }).click()
await page.waitForSelector('h1:has-text("Staff console")', { timeout: 20_000 }).catch(() => fail('sign-in failed'))
step('signed in')

// Search for the batch by its canonical code
await page.fill('#batch-q', BATCH)
await page.getByRole('button', { name: /^search$/i }).click()
const row = page.locator('li', { hasText: BATCH }).first()
await row.waitFor({ timeout: 15_000 }).catch(() => fail(`batch ${BATCH} not found`))
step(`batch ${BATCH} found`)

// Map the vendor code
await page.fill(`input[aria-label="Add vendor code to ${BATCH}"]`, ALIAS)
await page.getByRole('button', { name: `Map code to ${BATCH}` }).click()
await page.locator(`span:has-text("${ALIAS}")`).first().waitFor({ timeout: 15_000 }).catch(() => fail('alias chip did not appear'))
step(`alias ${ALIAS} mapped`)

// Public lookup must now resolve through the alias
const viaAlias = await (await fetch(`${BASE}/bff/v1/batches/${ALIAS}`)).json()
if (viaAlias.kind !== 'genuine' || viaAlias.record?.batch !== BATCH) await fail(`public lookup via alias failed: ${JSON.stringify(viaAlias)}`)
step(`public lookup resolves ${ALIAS} → ${viaAlias.record.batch} (${viaAlias.matchedAlias ?? 'alias'})`)

// Remove the alias
await page.getByRole('button', { name: `Remove alias ${ALIAS}` }).click()
await page.locator(`span:has-text("${ALIAS}")`).first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => fail('alias chip did not disappear'))
step(`alias ${ALIAS} removed`)

const after = await (await fetch(`${BASE}/bff/v1/batches/${ALIAS}`)).json()
if (after.kind !== 'not_found') await fail(`alias still resolves after removal: ${JSON.stringify(after)}`)
step('public lookup no longer resolves the removed alias')

if (pageErrors.length) await fail(`page errors during journey: ${pageErrors.join(', ')}`)
console.log(JSON.stringify({ ok: true, batch: BATCH, alias: ALIAS }, null, 2))
await browser.close()
process.exit(0)
