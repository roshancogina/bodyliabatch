import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertMockAllowed, IS_PROD_BUILD, PREVIEW_AUTH_ENABLED } from './runtime-env'

const here = dirname(fileURLToPath(import.meta.url))

describe('frontend data isolation', () => {
  it('current (non-prod) process allows mock fixtures', () => {
    expect(IS_PROD_BUILD).toBe(false)
    expect(PREVIEW_AUTH_ENABLED).toBe(true)
    expect(() => assertMockAllowed('unit probe')).not.toThrow()
  })

  it('every mock dataset routes through assertMockAllowed', () => {
    const dataDir = join(here, '..', 'data')
    const files = readdirSync(dataDir).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const src = readFileSync(join(dataDir, f), 'utf8')
      if (/^export const (BATCHES|DEMO_BATCHES|PRODUCTS|SEED_|HOTSPOTS|LOOKUPS_|NOT_FOUND_|SERVICE_HEALTH)/m.test(src)) {
        expect(src, `${f} must call assertMockAllowed`).toContain('assertMockAllowed(')
      }
    }
  })

  it('mock store asserts at module load; auth is import-safe in production', () => {
    const store = readFileSync(join(here, 'store.ts'), 'utf8')
    expect(store).toContain("assertMockAllowed('mock store')")
    // auth.ts is statically imported by the production sign-in screen, so it
    // must never throw at load and must not evaluate the mock store eagerly —
    // preview-only flows reach the store via guarded dynamic import instead.
    const auth = readFileSync(join(here, 'auth.ts'), 'utf8')
    expect(auth).not.toMatch(/^assertMockAllowed\(/m)
    expect(auth).not.toMatch(/from\s+['"]\.\/store['"]/)
    expect(auth).toContain("await import('./store')")
  })

  it('console entry statically imports only production-safe modules', () => {
    // Regression (Oct 2026): #/console broke because AdminApp statically
    // imported lib/store, AdminShell, AcceptInvitation and (via SignIn)
    // data/admin-seed — every one of those throws at module load in prod
    // builds, killing the lazy chunk before the sign-in screen rendered.
    // Preview-only modules must load via lazy(() => import(...)); static
    // imports may only reference prod-safe modules (bff, auth, runtime-env,
    // roles, batches, ui components).
    const adminDir = join(here, '..', 'admin')
    // ProdOverview/admin-api/insights are the API-backed console modules;
    // all must stay import-safe in production builds too. The prod/* pages
    // (reports, escalations, intelligence, catalogue, settings, audit) and
    // the register-batch dialog are statically imported by ProdShell.
    const entries = [
      'AdminApp.tsx',
      'ProdShell.tsx',
      'ProdOverview.tsx',
      'ProdRegisterBatchDialog.tsx',
      'admin-api.ts',
      'insights.ts',
      'access/SignIn.tsx',
      'prod/shared.tsx',
      'prod/ProdReportsPage.tsx',
      'prod/ProdEscalationsPage.tsx',
      'prod/ProdIntelligencePage.tsx',
      'prod/ProdCataloguePage.tsx',
      'prod/ProdSettingsPage.tsx',
      'prod/ProdAuditPage.tsx',
      'prod/ProdBatchDialogs.tsx',
      'prod/ProdCatalogueDialogs.tsx',
    ]
    const banned = /from\s+['"](\.\.\/)*(data\/(products|admin-seed|mock-batches)|lib\/store)['"]/
    const offenders: string[] = []
    for (const rel of entries) {
      const src = readFileSync(join(adminDir, rel), 'utf8')
      const runtime = src
        .split('\n')
        .filter((line) => !/^\s*import\s+type\b/.test(line))
        .join('\n')
      const m = runtime.match(banned)
      if (m) offenders.push(`${rel}: static import of mock-only module [${m[0]}]`)
    }
    expect(offenders).toEqual([])

    const adminApp = readFileSync(join(adminDir, 'AdminApp.tsx'), 'utf8')
    expect(adminApp).not.toMatch(/from\s+['"]\.\/AdminShell['"]/)
    expect(adminApp).toMatch(/lazy\(\(\) => import\('\.\/AdminShell'\)/)
    expect(adminApp).toMatch(/lazy\(\(\) => import\('\.\/access\/AcceptInvitation'\)/)
    expect(adminApp).toMatch(/lazy\(\(\) => import\('\.\/access\/SetupTwoStep'\)/)
  })

  it('production render paths never import mock fixtures', () => {
    // WSOD guard (Oct 2026): SiteHeader imported data/products at module
    // scope, so the prod build threw [isolation] at load and rendered a
    // white screen. Prod-safe modules: data/catalog-static (brand + display
    // strings) and data/batches (pure types + alias helpers only).
    // data/* fixtures + lib/store + lib/auth are dev/test-only.
    const prodPaths = [
      'App.tsx',
      'index.tsx',
      'components/SiteHeader.tsx',
      'components/SiteFooter.tsx',
      'components/SearchHero.tsx',
      'components/HowItWorks.tsx',
      'components/ProductLineup.tsx',
      'components/BatchSearchForm.tsx',
      'components/WhereToFindDialog.tsx',
      'components/ReportForm.tsx',
      'components/public/TrackReport.tsx',
      'components/public/ShareFeedback.tsx',
      'components/public/ActiveRecalls.tsx',
      'components/public/FaqPage.tsx',
      'components/public/LegalPage.tsx',
      'components/public/NotFoundPage.tsx',
      'components/public/MaintenancePage.tsx',
      'components/CaptchaField.tsx',
      'lib/bff.ts',
      'lib/products.ts',
      'lib/router.ts',
      'lib/schemas.ts',
      'lib/captcha.ts',
      'lib/runtime-env.ts',
      'data/catalog-static.ts',
    ]
    // NOTE: data/batches is PURE types + alias helpers (no fixtures, no
    // guard) since the WSOD fix — bff.ts + AliasManager import it at runtime
    // safely. Banned: fixture modules (products, admin-seed, mock-batches)
    // and the dev-only store/auth singletons.
    const banned = /from\s+['"](\.\.\/)*data\/(products|admin-seed|mock-batches)['"]|from\s+['"](\.\.\/)*lib\/(store|auth)['"]/
    const offenders: string[] = []
    for (const rel of prodPaths) {
      const f = join(here, '..', rel)
      let src: string
      try {
        src = readFileSync(f, 'utf8')
      } catch {
        offenders.push(`${rel}: listed prod path does not exist`)
        continue
      }
      // type-only imports are erased at build time — strip them first.
      const runtime = src
        .split('\n')
        .filter((line) => !/^\s*import\s+type\b/.test(line))
        .join('\n')
      const m = runtime.match(banned)
      if (m) offenders.push(`${rel}: runtime import of mock module [${m[0]}]`)
    }
    expect(offenders).toEqual([])
  })

  it('no hardcoded service URL or credential in src', () => {
    const scan = (dir: string): string[] => {
      const out: string[] = []
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) out.push(...scan(p))
        else if (/\.tsx?$/.test(e.name)) out.push(p)
      }
      return out
    }
    const offenders: string[] = []
    for (const f of scan(join(here, '..'))) {
      if (f.includes('.test.')) continue
      const rel = f.split(`${join(here, '..')}/`)[1] ?? f
      const src = readFileSync(f, 'utf8')
      if (/https?:\/\/(localhost|127\.0\.0\.1):8101/.test(src)) {
        offenders.push(`${rel}: hardcoded API URL`)
      }
      if (!f.endsWith('lib/auth.ts')) {
        const stripped = src
          .replace(/like BDLRC-[A-Z0-9-]+/gi, 'like RECOVERY-EXAMPLE')
          .replace(/e\.g\. BDLRC-[A-Z0-9-]+/gi, 'e.g. RECOVERY-EXAMPLE')
        // access/SetupTwoStep.tsx holds the MOCK recovery-code list, which is
        // itself gated by assertMockAllowed('mock recovery codes') at module
        // scope — the one audited exception to the literal rule.
        const isMockRecoveryList = rel.endsWith('access/SetupTwoStep.tsx') && stripped.includes("assertMockAllowed('mock recovery codes')")
        if (!isMockRecoveryList && (/Bodylia@2026/.test(stripped) || /BDLRC-7Q4M-9X2K/.test(stripped))) {
          offenders.push(`${rel}: hardcoded preview credential literal`)
        }
      }
      if (!f.endsWith('lib/auth.ts') && /\b246810\b/.test(src) && !/PREVIEW_AUTH_ENABLED/.test(src)) {
        offenders.push(`${rel}: hardcoded preview TOTP without preview gate`)
      }
    }
    expect(offenders).toEqual([])
  })
})
