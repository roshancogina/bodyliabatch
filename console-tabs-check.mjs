import { chromium } from '@playwright/test'

// Live validation of the six API-backed production console tabs (reports,
// escalations, intelligence, catalogue, settings, audit): sign in (email 2FA
// supported via CHECK_2FA_CODE), click each nav tab, assert its endpoint
// answers 200 and the tab heading renders — zero JS errors throughout.
// Read-only: no mutations are performed.
const BASE = process.argv[2] ?? 'https://batch.bodylia.in'
const EMAIL = process.env.CHECK_EMAIL ?? 'roshan@bodylia.in'
const PASSWORD = process.env.CHECK_PASSWORD ?? 'gloscon10'
const CODE_2FA = process.env.CHECK_2FA_CODE ?? ''

const TABS = [
  { nav: 'Reports', api: '/api/admin/reports', heading: /customer reports/i },
  { nav: 'Escalations', api: '/api/admin/escalations', heading: /^escalations$/i },
  { nav: 'Intelligence', api: '/api/admin/insights', heading: /^intelligence$/i },
  { nav: 'Catalogue', api: '/api/admin/catalogue', heading: /product catalogue/i },
  { nav: 'Settings', api: '/api/admin/settings', heading: /^settings$/i },
  { nav: 'Audit log', api: '/api/admin/audit', heading: /audit log/i },
]

const browser = await chromium.launch()
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

const step = (msg) => console.log(`• ${msg}`)
const fail = async (msg) => {
  console.error(`✗ ${msg}`)
  console.error('page errors:', pageErrors)
  await page.screenshot({ path: '/tmp/tabs-check-fail.png', fullPage: true }).catch(() => {})
  await browser.close()
  process.exit(1)
}

// ---- sign in (password → optional email 2FA code step) ----
await page.goto(`${BASE}/#/console`, { waitUntil: 'load', timeout: 30_000 })
await page.waitForTimeout(1_500)
await page.fill('input[autocomplete="username"]', EMAIL)
await page.fill('input[autocomplete="current-password"]', PASSWORD)
await page.waitForTimeout(2_500)
// Capture the login response: test/dev APIs return the 2FA code inline
// (APP_ENV=test), production delivers it via EmailIt (use CHECK_2FA_CODE).
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
    step('captured test-mode 2FA code from the login response')
  }
}

const onShell = await page
  .waitForSelector('h1:has-text("Staff console")', { timeout: 8_000 })
  .then(() => true)
  .catch(() => false)
if (!onShell) {
  // Email 2FA step — mandatory for every staff account.
  const onCode = await page
    .getByRole('heading', { name: /confirm your identity/i })
    .waitFor({ timeout: 8_000 })
    .then(() => true)
    .catch(() => false)
  if (!onCode) await fail('sign-in reached neither the console nor the email 2FA step')
  step('reached email 2FA step')
  if (!code2fa) {
    await fail('CHECK_2FA_CODE not set — read the 6-digit code from the inbox and re-run with CHECK_2FA_CODE=XXXXXX')
  }
  await page.fill('input[autocomplete="one-time-code"]', code2fa)
  await page.getByRole('button', { name: /verify and sign in/i }).click()
  await page.waitForSelector('h1:has-text("Staff console")', { timeout: 20_000 }).catch(() =>
    fail('2FA verification failed — wrong or expired code'),
  )
}
step('signed in')

// ---- click through every API-backed tab ----
const checked = []
for (const t of TABS) {
  const resP = page
    .waitForResponse((r) => r.url().includes(t.api) && r.status() === 200, { timeout: 15_000 })
    .catch(() => null)
  await page.getByRole('button', { name: t.nav, exact: true }).click()
  const res = await resP
  if (!res) await fail(`${t.nav}: GET ${t.api} did not return 200`)
  await page.getByRole('heading', { name: t.heading }).waitFor({ timeout: 10_000 }).catch(() =>
    fail(`${t.nav}: tab heading did not render`),
  )
  checked.push({ tab: t.nav, api: t.api, status: res.status() })
  step(`${t.nav}: 200 + rendered`)
}

if (pageErrors.length) await fail(`page errors during journey: ${pageErrors.join(', ')}`)
console.log(JSON.stringify({ ok: true, checked }, null, 2))
await browser.close()
process.exit(0)
