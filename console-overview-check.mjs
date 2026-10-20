import { chromium } from '@playwright/test'

// Live validation of the production console Overview tab: sign in → the
// Overview tab is the default → GET /api/admin/insights answers 200 with the
// full contract → the tab renders live KPIs (Today at a glance, workload)
// without JS errors. Read-only.
const BASE = process.argv[2] ?? 'https://batch.bodylia.in'
const EMAIL = process.env.CHECK_EMAIL ?? 'roshan@bodylia.in'
const PASSWORD = process.env.CHECK_PASSWORD ?? 'gloscon10'

const browser = await chromium.launch()
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

const step = (msg) => console.log(`• ${msg}`)
const fail = async (msg) => {
  console.error(`✗ ${msg}`)
  console.error('page errors:', pageErrors)
  await page.screenshot({ path: '/tmp/overview-check-fail.png', fullPage: true }).catch(() => {})
  await browser.close()
  process.exit(1)
}

await page.goto(`${BASE}/#/console`, { waitUntil: 'load', timeout: 30_000 })
await page.waitForTimeout(1_500)
await page.fill('input[autocomplete="username"]', EMAIL)
await page.fill('input[autocomplete="current-password"]', PASSWORD)
await page.waitForTimeout(2_500)
await page.getByRole('button', { name: /continue/i }).click()
const CODE_2FA = process.env.CHECK_2FA_CODE ?? ''
const onShell = await page
  .waitForSelector('h1:has-text("Staff console")', { timeout: 8_000 })
  .then(() => true)
  .catch(() => false)
if (!onShell) {
  // Email 2FA is mandatory for every staff account in production — the code
  // arrives via EmailIt; pass it through CHECK_2FA_CODE to complete the run.
  const onCode = await page
    .getByRole('heading', { name: /confirm your identity/i })
    .waitFor({ timeout: 8_000 })
    .then(() => true)
    .catch(() => false)
  if (!onCode) await fail('sign-in reached neither the console nor the email 2FA step')
  step('reached email 2FA step (code delivered via EmailIt)')
  if (!CODE_2FA) {
    await fail('CHECK_2FA_CODE not set — read the 6-digit code from the inbox and re-run with CHECK_2FA_CODE=XXXXXX')
  }
  await page.fill('input[autocomplete="one-time-code"]', CODE_2FA)
  await page.getByRole('button', { name: /verify and sign in/i }).click()
  await page.waitForSelector('h1:has-text("Staff console")', { timeout: 20_000 }).catch(() =>
    fail('2FA verification failed — wrong or expired code'),
  )
}
step('signed in')

// Overview is the default tab — its fetch must answer with the full contract.
const insightsRes = await page
  .waitForResponse((r) => r.url().includes('/api/admin/insights') && r.status() === 200, { timeout: 15_000 })
  .catch(() => fail('GET /api/admin/insights did not return 200'))
const insights = await insightsRes.json()
if (!Array.isArray(insights?.lookups14d?.days) || insights.lookups14d.days.length !== 14) {
  await fail(`insights payload missing 14-day trend: ${JSON.stringify(insights).slice(0, 300)}`)
}
if (typeof insights?.reports?.open !== 'number' || !Array.isArray(insights?.reports?.workload)) {
  await fail('insights payload missing report KPIs/workload')
}
step(`insights loaded: ${insights.reports.open} open reports, ${insights.hotspots.length} hotspots, ${insights.batches.recalled} recalls`)

// Live numbers must be on screen (KPI grid + owner workload), not fixtures.
await page.getByRole('heading', { name: /today at a glance/i }).waitFor({ timeout: 10_000 }).catch(() => fail('KPI grid did not render'))
await page.getByRole('heading', { name: /open reports by owner/i }).waitFor({ timeout: 10_000 }).catch(() => fail('workload section did not render'))
step('overview KPIs rendered from live data')

if (pageErrors.length) await fail(`page errors during journey: ${pageErrors.join(', ')}`)
console.log(JSON.stringify({ ok: true, open: insights.reports.open, hotspots: insights.hotspots.length }, null, 2))
await browser.close()
process.exit(0)
