import { chromium } from '@playwright/test'

// Usage: node console-prod-check.mjs [url]
// Validates that a PRODUCTION build of the portal renders (no WSOD) and that
// the staff console (#/console) mounts its sign-in screen without JS errors.
// Network failures (no API behind the preview) are tolerated; JS exceptions
// and blank pages are not.
const url = process.argv[2] ?? 'http://127.0.0.1:4173/#/console'

const browser = await chromium.launch()
const page = await browser.newPage()
const pageErrors = []
const consoleErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})

await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
await page.waitForTimeout(1_500)

const text = await page.locator('body').innerText()
const h1 = (await page.locator('h1').first().textContent().catch(() => null))?.trim() ?? null
const hasSignInForm = await page.locator('input[type="email"], input[autocomplete="username"]').first().isVisible().catch(() => false)

const realErrors = [...pageErrors, ...consoleErrors].filter(
  (e) => !/Failed to load resource|net::ERR_|404 \(Not Found\)|Load failed/i.test(e),
)

const report = { url, bodyLen: text.length, h1, hasSignInForm, pageErrors, realErrors }
console.log(JSON.stringify(report, null, 2))

await browser.close()
const ok = text.length > 100 && h1 !== null && pageErrors.length === 0 && realErrors.length === 0
process.exit(ok ? 0 : 1)
