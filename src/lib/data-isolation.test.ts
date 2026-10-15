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

  it('mock store and preview auth assert at module load', () => {
    const store = readFileSync(join(here, 'store.ts'), 'utf8')
    const auth = readFileSync(join(here, 'auth.ts'), 'utf8')
    expect(store).toContain("assertMockAllowed('mock store')")
    expect(auth).toContain("assertMockAllowed('mock preview auth')")
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
      const rel = f.split('bodyliabatch/')[1] ?? f
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
