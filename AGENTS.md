# batch.bodylia.in — Agent Harness

Project: Bodylia batch verification portal (`batch.bodylia.in`).
Stack: Vite + React 18 + TypeScript frontend · Go + Gin + Postgres backend · Playwright e2e.

> The 6 attached PDF playbooks (Architecture, BatchPlan, GoAPIs, PostGresBackend,
> RulesSkillsHarnessTDD, ScreenInventory) could not be read in this environment
> (Downloads permission denied + binary fetch failed). This harness is therefore
> derived from the shipped frontend (`bodyliabatch.zip`) and its in-code contracts.
> Drop the PDFs into `docs/playbooks/` and reconcile — section 8 lists the mapping.

## 1. Canonical nomenclature — UIBatch XX-NNNN-XXNN (STRICT)

- Canonical batch: `XX-NNNN-XXNN` — 2 alphanumerics (A–Z, 0–9), hyphen, 4 digits, hyphen, 2 alphanumerics + 2 digits
  - Regex: `^[A-Z0-9]{2}-\\d{4}-[A-Z0-9]{2}\\d{2}$` (`src/lib/schemas.ts` BATCH_PATTERN, `src/lib/utils.ts` UIBATCH_PATTERN; Go mirror in `backend-go/nomenclature.go`)
  - Example: `PE-2610-WL01` (XX `PE` = PeriHarmon; XX identifies the product)
  - Spaces stripped/ignored everywhere (`stripSpaces` → `normaliseBatch` auto-inserts hyphens)
  - Enforced at: admin register (`registerBatchSchema` + per-position `canonicalBatchError`),
    CSV import (`csvRowSchema`), Go API (`canonicalBatchError`), Postgres CHECK + product
    cross-check (`SUBSTRING(batch FROM 1 FOR 2) = product_code`, migration `005_first_batch.sql`)
- Public lookup + report forms are PERMISSIVE (`batchLookupSchema` → `normaliseAlias`):
  canonical, spaced, manufacturer or label codes; 3–40 chars, must contain [A-Z0-9].
  Resolution to canonical happens in `resolveBatch()`.
- Sensible per-position errors pinned in `docs/UIBATCH-STANDARD-TEST-SCENARIOS.md`.

## 1a. First production batch (NOV 2026 → APR 2028)

| Product | Type | Our batch | Mfr code | Qty | MFG | MRP | EXP |
|---|---|---|---|---|---|---|---|
| PERIHARMON | CAPSULE | PE-2610-WL01 | 2K26001 | 1000 | NOV 2026 | 1399 | APR 2028 |
| FERRIMUNE | CAPSULE | FE-2610-WL01 | 2K26002 | 1000 | NOV 2026 | 1199 | APR 2028 |
| FERTILINOVA | CAPSULE | FN-2610-WL01 | 2K26003 | 1000 | NOV 2026 | 1499 | APR 2028 |
| MATERNABLOOM | CAPSULE | MB-2610-WL01 | 2K26004 | 1000 | NOV 2026 | 1399 | APR 2028 |
| CINDORIA | SACHET | CI-2610-WL01 | 2K26005 | 1000 | NOV 2026 | 1899 | APR 2028 |

Seeded by migration `005_first_batch.sql` (+ `qty`/`mrp` columns); mock mirrors in
`src/data/batches.ts` (dev/test only — throws in production builds). Result page
shows pack quantity + MRP (`BatchFacts`).

## 2. Mapped batch codes — manufacturer + label (MULTI-WAY SEARCH)

- Every `BatchRecord` carries `aliases?: (string | { code, kind })[]`, kind `manufacturer | label`.
  Postgres `batch_aliases.kind` CHECK enforces the same.
- Resolution order (`src/lib/bff.ts resolveBatch`, Go `Store.ResolveBatch`):
  1. exact canonical (space-tolerant) → 2. exact mapped alias (+kind) → 3. compact match.
- Public result shows a "Manufacturer/Label code X → mapped to Y" banner (`VerdictBand`, `matchedKind`).
- Admin search matches canonical, mapped-code substring, compact substring, product name.
- Mapping rules: 3–40 chars, not canonical-shaped, not repeating own batch,
  globally unique (compact-insensitive), max 20 per batch, kind required.
- Entry points: `RegisterBatchDialog` (mapped-codes textarea), `AliasManager`
  (map/remove with kind picker, in `BatchDetailSheet`), `BulkImportPage`
  (optional trailing `,aliases` column, pipe-separated).
- Duplicate mapped code → 400/409 naming the owning batch (frontend + Go + SQL UNIQUE).

## 3. Rules (agent MUST follow)

1. Canonical format never relaxes — only aliases are permissive.
2. Mapped codes never look like `XX-NNNN-XXNN` canonical; register those as batches instead.
3. Mapped-code uniqueness is global (canonical + alias namespaces share one index).
4. Every mapping mutation writes an audit event (`Mapped/Removed batch code`).
5. CSV import is all-or-nothing; aliases column is optional but validated identically.
6. Public verify never reveals whether an unknown code is "fake" vs "typo" — keep `not_found` copy.
7. WCAG 2.2 AA: labels for every input, `aria-invalid`/`aria-describedby` wiring,
   min 44px targets, burgundy focus ring (see `src/index.css` tokens).
8. Captcha: every UNAUTHENTICATED entry form carries the self-hosted PoW check
   (`src/components/CaptchaField.tsx`, backend `backend-go/captcha.go`):
   public verify (BatchSearchForm), report (ReportForm), track (TrackReport),
   feedback (ShareFeedback), staff sign-in (SignIn), forgot-password
   (ForgotPassword), invite/reset password set (NewPasswordForm). TwoStep +
   SetupTwoStep are exempt BY DESIGN (reachable only after a captcha-gated
   step; TOTP/recovery is itself rate-limited) — documented in-code.
   Post-login staff dialogs (behind JWT) are exempt — bots can't reach
   them. Backend login (`POST /api/auth/login`) + report/track enforce
   the token too (`requireCaptcha`; test bypass = APP_ENV=test + flag only).

## 4. Skills

| Skill | File | Use when |
|---|---|---|
| uibatch-standard | `agents/skills/uibatch-standard/SKILL.md` | validating/typing any batch or mapped code |
| alias-resolution | `agents/skills/alias-resolution/SKILL.md` | public verify, admin search, reports (manufacturer/label kinds) |
| batch-admin | `agents/skills/batch-admin/SKILL.md` | register / edit / recall / import / aliases |
| deploy-batch-subdomain | `agents/skills/deploy-batch-subdomain/SKILL.md` | shipping `batch.bodylia.in` |

## 5. TDD harness (full pyramid)

| Layer | Command | Covers |
|---|---|---|
| Frontend units | `npm test` (vitest) | `uibatch-standard`, `uibatch-aliases`, `captcha`, `admin-schemas` (98 tests) |
| API contract | `npm run test:api` (Go, `bodyliabatch_test`) | public BFF + admin JWT + insights aggregates + mapped register/search + nomenclature + login PoW + rate-limit override (32 tests) |
| End-to-end | `npm run test:e2e` (Playwright, Chromium) | real Postgres + Go + Vite journeys (canonical, manufacturer, spaced, malformed, unknown, 404, register+verify) |
| Types | `npm run typecheck` | `tsc --noEmit` clean |

Manual checklist before ship:
  - [ ] `PE-2610-WL01` verifies genuine; `pe 2610 wl01`, `2K26001` resolve to same record with kind banner; qty 1000 + MRP ₹1,399 shown.
  - [ ] Unknown `ZZ-9999-9Z99` shows not-found help, not an accusation; malformed `F-261-0W` shows the per-position error.
  - [ ] Admin search for `2K26005` finds `CI-2610-WL01`.
  - [ ] Register with duplicate mapped code is blocked with the owning batch named.
  - [ ] CSV with bad alias row blocks the whole import.
  - [ ] Every unauthenticated form (verify/report/track/feedback/sign-in/forgot) shows the human check; submit without it is blocked.

## 6. Local services (Postgres + Go API + Vite)

- Databases: `bodyliabatch` (dev) + `bodyliabatch_test` (Go + Playwright), Postgres 17 via Postgres.app.
- Migrations: `backend-go/migrations/001_initial_schema.sql` (14 tables, canonical CHECK + product-code cross-check + global alias uniqueness),
  `002_seed_master_data.sql` (catalogue), `003_seed_coa_reports_users.sql` (staff + demo reports),
  `004_uibatch_standard.sql` (interim XX-NNNN-NNNN remap), `005_first_batch.sql`
  (first production batch: PE/FE/FN/MB/CI + 2K2600x manufacturer codes + qty/mrp + COA).
- Runner: `backend-go/migrate.go` applies each file once (ledger `schema_migrations`); also `scripts/db-migrate.sh`, `scripts/db-reset.sh`, `scripts/services-up.sh`.
- API (Go + Gin, port 8101): `GET /api/health`, `GET /bff/v1/batches/:batch` (alias-aware genuine/expired/recalled/404 + DB rate limit),
  `POST /bff/v1/reports`, `POST /bff/v1/reports/track` (reference+email, no leak),
  `GET /bff/v1/recalls`, `POST /api/auth/login` (bcrypt + 15-min JWT), `/api/admin/*` (JWT: me, insights (console Overview aggregates), batches search/get/register, alias add/remove, all audited).
- Frontend seam: `src/lib/bff.ts` uses the Go service when `VITE_API_URL` is set (`npm run dev:api`), else the in-memory mock (unit tests/preview).
- E2e (`playwright.config.ts`, Chromium): `e2e/public-verify.spec.ts` (5 browser+API), `e2e/admin-batches.spec.ts` (3 API+browser).
- Ports: API 8101, Vite 5175 locally (5173/5174 are taken by other Docker projects on this machine), preview 4173.

## 7. Deploy (batch.bodylia.in)

- Static SPA (`dist/`), hash routing — no server rewrites needed.
- `deploy/nginx-batch-bodylia.conf` is the drop-in server block (HTTPS, `batch.bodylia.in`,
  QR deep links `/?b=PE-2610-WL01`).
- `deploy/Dockerfile` serves `dist/` via nginx. Build: `npm ci && npm run build`.
- Previews: `admin@bodylia.in / Bodylia@2026`, 2FA `246810`.

## 8. Playbook reconciliation (when PDFs are available)

Drop the 6 PDFs into `docs/playbooks/` and map:
- Architecture.pdf → confirm BFF routes in `src/lib/bff.ts` header; adjust `deploy/` to match.
- BatchPlan.pdf → UIBatch `XX-NNNN-XXNN` adopted as the standard; XX prefix identifies the product.
- GoAPIs.pdf → replace mock BFF with real endpoints; keep `resolveBatch` contract server-side too.
- PostGresBackend.pdf → `batches` + `batch_aliases(alias UNIQUE, kind)` + migrations `004_uibatch_standard.sql` → `005_first_batch.sql`; seeds from `src/data/batches.ts`.
- RulesSkillsHarnessTDD.pdf → merge with this file; keep sections 3–5 as the executable subset.
- ScreenInventory.pdf → verify every admin route in `AdminApp`/`AdminShell` is listed; add missing screens.
