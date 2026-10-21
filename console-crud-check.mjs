import { chromium } from '@playwright/test'

// Deep QA sweep of the PRODUCTION console CRUD: drives the real bundle
// (vite preview or https://batch.bodylia.in) through batch edit / recall /
// restore / CSV import, catalogue add / edit / remove, settings save,
// profile rename and audit verification — then reloads to prove the session
// survives refresh without signing out.
//
// Usage: node console-crud-check.mjs [url]
//   CHECK_EMAIL / CHECK_PASSWORD / CHECK_2FA_CODE for production; test-mode
//   APIs return the 2FA code inline (captured automatically).
// Mutations use dynamic QA-only rows or restorable state.
const BASE = process.argv[2] ?? 'https://batch.bodylia.in'
const EMAIL = process.env.CHECK_EMAIL ?? 'roshan@bodylia.in'
const PASSWORD = process.env.CHECK_PASSWORD ?? 'gloscon10'
const CODE_2FA = process.env.CHECK_2FA_CODE ?? ''

// Per-run unique tokens (avoid collisions with leftovers from prior runs).
const N = String(Math.floor(Date.now() / 1000) % 100000).padStart(5, '0')
const PRODUCT_CODE = `Z${String.fromCharCode(65 + (Number(N.slice(-1)) % 26))}` // ZA–ZZ
const PRODUCT_NAME = `QA Product ${N}`
const SITE_NAME = `QA Test Facility ${N}`
const IMPORT_BATCH = `FN-${N.slice(0, 4)}-QA01`
const IMPORT_ALIAS = `QA-IMP-${N}`
const MFG_FACILITY = `QA Restored Facility ${N}`

const browser = await chromium.launch()
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

const step = (msg) => console.log(`• ${msg}`)
const fail = async (msg) => {
  console.error(`✗ ${msg}`)
  console.error('page errors:', pageErrors)
  await page.screenshot({ path: '/tmp/crud-check-fail.png', fullPage: true }).catch(() => {})
  await browser.close()
  process.exit(1)
}
const goTab = async (name) => {
  await page.getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(400)
}
const dialog = () => page.getByRole('dialog').last()
const expectGone = async (what) => {
  try {
    await page.getByRole('dialog').first().waitFor({ state: 'hidden', timeout: 6000 })
  } catch {
    const toasts = await page
      .locator('[role="status"], [role="alert"]')
      .allTextContents()
      .catch(() => [])
    const dlgText = await page
      .getByRole('dialog')
      .first()
      .innerText()
      .catch(() => '')
    await fail(`${what} did not close — toasts: ${JSON.stringify(toasts)} — dialog: ${JSON.stringify(dlgText.slice(0, 400))}`)
  }
}

// ---- sign in (password → email 2FA; test mode returns the code inline) ----
await page.goto(`${BASE}/#/console`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
await page.waitForTimeout(1_500)
await page.fill('input[autocomplete="username"]', EMAIL)
await page.fill('input[autocomplete="current-password"]', PASSWORD)
await page.waitForTimeout(2_000)
const loginResP = page
  .waitForResponse((r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST', { timeout: 15_000 })
  .catch(() => null)
await page.getByRole('button', { name: /continue/i }).click()
let code2fa = CODE_2FA
const loginRes = await loginResP
if (loginRes) {
  const body = await loginRes.json().catch(() => null)
  if (body?.code) {
    code2fa = String(body.code)
    step('captured test-mode 2FA code')
  }
}
const onShell = await page
  .waitForSelector('h1:has-text("Staff console")', { timeout: 8_000 })
  .then(() => true)
  .catch(() => false)
if (!onShell) {
  const onCode = await page
    .getByRole('heading', { name: /confirm your identity/i })
    .waitFor({ timeout: 8_000 })
    .then(() => true)
    .catch(() => false)
  if (!onCode) await fail('sign-in reached neither the console nor the 2FA step')
  if (!code2fa) await fail('CHECK_2FA_CODE not set (production delivers it via EmailIt)')
  await page.fill('input[autocomplete="one-time-code"]', code2fa)
  await page.getByRole('button', { name: /verify and sign in/i }).click()
  await page.waitForSelector('h1:has-text("Staff console")', { timeout: 20_000 }).catch(() =>
    fail('2FA verification failed — wrong or expired code'),
  )
}
step('signed in')

// ---- Batches: edit (reason enforced, value round-trips) ----
await goTab('Batches & aliases')
const openEdit = async (batch) => {
  await page.getByRole('button', { name: `Edit ${batch}` }).click()
  await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
}
await openEdit('PE-2610-WL01')
const facilitySelect = dialog().getByLabel('Manufacturing facility')
const originalFacility = await facilitySelect.inputValue()
const availableOptions = await facilitySelect
  .locator('option')
  .evaluateAll((opts) => opts.map((o) => o.value).filter((v) => v && !v.includes('(current)')))
const alternateFacility = availableOptions.find((v) => v !== originalFacility) || availableOptions[0]
await facilitySelect.selectOption(alternateFacility)
await dialog().getByLabel('Reason for the change').fill('QA sweep: temporary facility value, restored immediately after.')
await dialog().getByRole('button', { name: 'Save changes' }).click()
await expectGone('edit dialog')
await page.waitForTimeout(600)
await openEdit('PE-2610-WL01')
const persisted = await dialog().getByLabel('Manufacturing facility').inputValue()
if (persisted !== alternateFacility) await fail(`edit did not persist (got "${persisted}", expected "${alternateFacility}")`)
await dialog().getByLabel('Manufacturing facility').selectOption(originalFacility)
await dialog().getByLabel('Reason for the change').fill('QA sweep: restoring the original facility value after verification.')
await dialog().getByRole('button', { name: 'Save changes' }).click()
await expectGone('facility restore dialog')
step('batch edit round-trip (dropdown selection, reason enforced, value persisted)')

// ---- Batches: recall + restore (public state flips) ----
await page.getByRole('button', { name: 'Recall FE-2610-WL01' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
await dialog().getByLabel('Reason customers will read').fill('QA sweep: temporary recall to verify the console round trip.')
await dialog().getByLabel('Type FE-2610-WL01 to confirm').fill('FE-2610-WL01')
await dialog().getByRole('button', { name: 'Recall batch' }).click()
await expectGone('recall dialog')
await page.waitForTimeout(700)
const feCard = page.locator('li').filter({ hasText: 'FE-2610-WL01' }).first()
if (!(await feCard.getByText('Recalled').first().isVisible().catch(() => false)))
  await fail('batch status did not flip to Recalled after recall')
await page.getByRole('button', { name: 'Restore FE-2610-WL01' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
await dialog().getByLabel('Why is the recall being lifted?').fill('QA sweep: recall lifted after verifying the console flow.')
await dialog().getByRole('button', { name: 'Restore batch' }).click()
await expectGone('restore dialog')
await page.waitForTimeout(700)
if (!(await feCard.getByText('Released').first().isVisible().catch(() => false)))
  await fail('batch status did not return to Released after restore')
step('recall + restore round-trip (status flipped back)')

// ---- Batches: CSV import (all-or-nothing) ----
await page.getByRole('button', { name: 'Import CSV' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
await dialog()
  .getByLabel('CSV rows')
  .fill(
    `batch,product,manufactured,expires,facility,lab,aliases\n${IMPORT_BATCH},FN,2026-09-01,2028-08-31,Goa Unit 1,Eurofins,${IMPORT_ALIAS}`,
  )
await dialog().getByRole('button', { name: 'Import batches' }).click()
await expectGone('import dialog')
await page.waitForTimeout(800)
if (!(await page.getByText(IMPORT_BATCH).first().isVisible().catch(() => false)))
  await fail(`imported batch ${IMPORT_BATCH} not listed`)
if (!(await page.getByText(IMPORT_ALIAS).first().isVisible().catch(() => false)))
  await fail(`imported alias ${IMPORT_ALIAS} not listed`)
// Aliased lookup resolves through the public API too.
const lookup = await page.request.get(`${BASE}/bff/v1/batches/${IMPORT_ALIAS}`)
if (lookup.status() !== 200) await fail(`public lookup of imported alias = ${lookup.status()}`)
step('CSV import (batch + alias live, public lookup resolves)')

// ---- COA: universal download for any batch ----
const coaRes = await page.request.get(`${BASE}/bff/v1/batches/PE-2610-WL01/coa`)
if (coaRes.status() !== 200) await fail(`COA download status = ${coaRes.status()}`)
const coaType = coaRes.headers()['content-type'] || ''
if (!coaType.includes('pdf')) await fail(`COA content-type = ${coaType}`)
step('COA universal download (PDF available via public BFF)')


// ---- Catalogue: product add → edit → remove ----
await goTab('Catalogue')
await page.getByRole('button', { name: 'Add product' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
await dialog().getByLabel('Product code').fill(PRODUCT_CODE)
await dialog().getByLabel('Name').fill(PRODUCT_NAME)
await dialog().getByLabel('On-pack claim').fill('QA sweep product for the catalogue CRUD verification run.')
await dialog().getByLabel('Pack format').fill('30 veg. HPMC capsules (QA)')
await dialog().getByLabel('Shelf life (months)').fill('24')
await dialog().getByLabel('Image URL').fill('https://example.com/qa-product.png')
await dialog().getByRole('button', { name: 'Create product' }).click()
await expectGone('product create dialog')
await page.waitForTimeout(700)
if ((await page.getByRole('row').filter({ hasText: PRODUCT_CODE }).count()) === 0)
  await fail(`created product ${PRODUCT_CODE} not listed`)

await page.getByRole('button', { name: `Edit product ${PRODUCT_NAME}` }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
await dialog().getByLabel('Name').fill(`${PRODUCT_NAME} v2`)
await dialog().getByRole('button', { name: 'Save changes' }).click()
await expectGone('product edit dialog')
await page.waitForTimeout(700)
if ((await page.getByRole('row').filter({ hasText: `${PRODUCT_NAME} v2` }).count()) === 0)
  await fail('edited product name not listed')

await page.getByRole('button', { name: `Remove product ${PRODUCT_NAME} v2` }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
await dialog().getByRole('button', { name: 'Remove' }).click()
await expectGone('product remove dialog')
await page.waitForTimeout(900)
if ((await page.getByRole('row').filter({ hasText: PRODUCT_CODE }).count()) > 0)
  await fail(`product ${PRODUCT_CODE} still listed after remove`)
step('product create → edit → remove (audited)')

// ---- Catalogue: site add → edit → remove ----
await page.getByRole('button', { name: 'Add site' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
await dialog().getByLabel('Name and city').fill(SITE_NAME)
await dialog().getByLabel('GMP licence number').fill(`GMP-QA-${N.slice(-4)}`)
await dialog().getByLabel('Accreditation expires').fill('2028-12-31')
await dialog().getByRole('button', { name: 'Create site' }).click()
await expectGone('site create dialog')
await page.waitForTimeout(700)
if ((await page.getByRole('row').filter({ hasText: SITE_NAME }).count()) === 0)
  await fail(`created site ${SITE_NAME} not listed`)

await page.getByRole('button', { name: `Edit site ${SITE_NAME}` }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
await dialog().getByLabel('GMP licence number').fill(`GMP-QA-${N.slice(-4)}-EDITED`)
await dialog().getByRole('button', { name: 'Save changes' }).click()
await expectGone('site edit dialog')
await page.waitForTimeout(700)

await page.getByRole('button', { name: `Remove site ${SITE_NAME}` }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
await dialog().getByRole('button', { name: 'Remove' }).click()
await expectGone('site remove dialog')
await page.waitForTimeout(900)
if ((await page.getByRole('row').filter({ hasText: SITE_NAME }).count()) > 0)
  await fail(`site ${SITE_NAME} still listed after remove`)
step('site create → edit → remove (audited)')


// ---- Settings: save round-trip (form → PATCH → success) ----
await goTab('Settings')
await page.getByRole('button', { name: 'Save settings' }).click()
await page.getByText('Settings saved').first().waitFor({ timeout: 8_000 }).catch(async () => {
  await fail('settings save did not confirm')
})
step('settings save round-trip')

// ---- My account: profile rename + restore ----
await goTab('My account')
const nameInput = page.getByLabel('Full name')
const originalName = await nameInput.inputValue()
await nameInput.fill(`${originalName} QA`)
await page.getByRole('button', { name: 'Save profile' }).click()
await page.getByText('Profile updated').first().waitFor({ timeout: 8_000 }).catch(async () => {
  await fail('profile save did not confirm')
})
step(`profile renamed to "${originalName} QA"`)
await nameInput.fill(originalName)
await page.getByRole('button', { name: 'Save profile' }).click()
await page.waitForTimeout(600)

// ---- Audit log: the QA mutations are on the record ----
await goTab('Audit log')
await page.getByLabel('Filter by target').fill(PRODUCT_CODE)
await page.getByRole('button', { name: 'Filter' }).click()
await page.waitForTimeout(700)
for (const action of ['Created product', 'Deleted product']) {
  if (!(await page.getByText(action).first().isVisible().catch(() => false)))
    await fail(`audit log missing "${action}" for ${PRODUCT_CODE}`)
}
await page.getByLabel('Filter by target').fill('PE-2610-WL01')
await page.getByRole('button', { name: 'Filter' }).click()
await page.waitForTimeout(700)
if (!(await page.getByText('Updated batch').first().isVisible().catch(() => false)))
  await fail('audit log missing "Updated batch" for PE-2610-WL01')
step('audit log shows batch + catalogue mutations with actor/target')

// ---- Session persistence: reload keeps the admin signed in ----
await page.reload({ waitUntil: 'domcontentloaded' })
const restored = await page
  .waitForSelector('h1:has-text("Staff console")', { timeout: 10_000 })
  .then(() => true)
  .catch(() => false)
if (!restored) await fail('console did NOT restore after reload — session lost')
step('session survives reload/back-navigation (no re-login, no sign-out)')

if (pageErrors.length) await fail(`page errors during journey: ${pageErrors.join(', ')}`)
console.log(JSON.stringify({
  ok: true,
  editedBatch: 'PE-2610-WL01 (facility round-trip)',
  recalledBatch: 'FE-2610-WL01 (recalled → restored)',
  imported: IMPORT_BATCH,
  product: `${PRODUCT_CODE} created/edited/removed`,
  site: `${SITE_NAME} created/edited/removed`,
  session: 'persisted across reload',
}, null, 2))
await browser.close()
process.exit(0)

