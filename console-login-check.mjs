import { chromium } from '@playwright/test'

// Live end-to-end validation of staff sign-in on https://batch.bodylia.in
//   1. #/console renders the sign-in screen (no WSOD)
//   2. roshan@bodylia.in / gloscon10 signs in (captcha auto-solves)
//   3. My account → change password works (to a policy-valid temp password)
//   4. sign out → sign in with the NEW password works
// Caller restores the original password afterwards (API bootstrap re-applies
// PROD_ADMIN_PASSWORD on container restart).
const BASE = process.argv[2] ?? 'https://batch.bodylia.in'
const EMAIL = process.env.CHECK_EMAIL ?? 'roshan@bodylia.in'
const CURRENT = process.env.CHECK_PASSWORD ?? 'gloscon10'
const TEMP = process.env.CHECK_TEMP_PASSWORD ?? 'Gloscon10!Temp2026'

const browser = await chromium.launch()
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

const step = (msg) => console.log(`• ${msg}`)
const fail = async (msg) => {
  console.error(`✗ ${msg}`)
  console.error('page errors:', pageErrors)
  await page.screenshot({ path: '/tmp/console-login-fail.png', fullPage: true }).catch(() => {})
  await browser.close()
  process.exit(1)
}

// 1. Sign-in screen renders
await page.goto(`${BASE}/#/console`, { waitUntil: 'load', timeout: 30_000 })
await page.waitForTimeout(1_500)
if (!(await page.locator('h1').first().textContent())?.includes('Staff sign in')) await fail('sign-in screen did not render')
step('sign-in screen renders')

// 2. Sign in with the seeded admin (captcha solves automatically)
await page.fill('input[autocomplete="username"]', EMAIL)
await page.fill('input[autocomplete="current-password"]', CURRENT)
await page.waitForTimeout(2_500) // PoW captcha solve
await page.getByRole('button', { name: /continue/i }).click()
await page.waitForSelector('h1:has-text("Staff console")', { timeout: 20_000 }).catch(() => fail('did not reach Staff console after sign-in'))
step(`signed in as ${EMAIL}`)

// 3. Change the password via My account
await page.getByRole('button', { name: /my account/i }).click()
await page.fill('#ac-current', CURRENT)
await page.fill('#ac-new', TEMP)
await page.fill('#ac-confirm', TEMP)
await page.getByRole('button', { name: /change password/i }).click()
await page.waitForSelector('text=Password changed', { timeout: 20_000 }).catch(() => fail('password change did not confirm'))
step('password changed via My account')

// 4. Sign out (confirmation screen → "Sign in again"), then sign in with the NEW password
await page.getByRole('button', { name: /sign out/i }).click()
await page.waitForSelector('text=signed out', { timeout: 15_000 }).catch(() => fail('sign-out confirmation did not appear'))
await page.getByRole('button', { name: /sign in again/i }).click()
await page.waitForSelector('h1:has-text("Staff sign in")', { timeout: 15_000 }).catch(() => fail('did not return to sign-in'))
await page.fill('input[autocomplete="username"]', EMAIL)
await page.fill('input[autocomplete="current-password"]', TEMP)
await page.waitForTimeout(2_500)
await page.getByRole('button', { name: /continue/i }).click()
await page.waitForSelector('h1:has-text("Staff console")', { timeout: 20_000 }).catch(() => fail('sign-in with new password failed'))
step('signed in with the new password')

if (pageErrors.length) await fail(`page errors during journey: ${pageErrors.join(', ')}`)

console.log(JSON.stringify({ ok: true, base: BASE, email: EMAIL }, null, 2))
await browser.close()
process.exit(0)
