# batch.bodylia.in — Agent Harness

Project: Bodylia batch verification portal (`batch.bodylia.in`).
Stack: Vite + React 18 + TypeScript frontend · Go + Gin + Postgres backend · Playwright e2e.

> The 6 attached PDF playbooks (Architecture, BatchPlan, GoAPIs, PostGresBackend,
> RulesSkillsHarnessTDD, ScreenInventory) could not be read in this environment
> (Downloads permission denied + binary fetch failed). This harness is therefore
> derived from the shipped frontend (`bodyliabatch.zip`) and its in-code contracts.
> Drop the PDFs into `docs/playbooks/` and reconcile — section 8 lists the mapping.

## 1. Canonical nomenclature (STRICT)

- Canonical batch: `BDL-<PRODUCT(2 letters)>-<YYMM>-<NNNN>`
  - Regex: `^BDL-[A-Z]{2}-\d{2}(0[1-9]|1[0-2])-\d{4}$` (`src/lib/schemas.ts` BATCH_PATTERN)
  - Example: `BDL-FR-2509-0312` (Ferrimune, Sept 2025, serial 0312)
  - Enforced at: admin register (`registerBatchSchema`), CSV import (`csvRowSchema`),
    product-code cross-check (`batch.slice(4,6) === product`)
- Normalisation: trim → UPPERCASE → spaces collapse to `-` (`normaliseBatch`)
- Public lookup + report forms are PERMISSIVE (`batchLookupSchema` → `normaliseAlias`):
  spaces/underscores/slashes/dots → `-`, collapsed, 3–40 chars, must contain [A-Z0-9].
  Resolution to canonical happens in `resolveBatch()`.

## 2. Vendor aliases (MULTI-WAY SEARCH)

- Every `BatchRecord` carries `aliases?: string[]` (normalised vendor lot codes).
- Resolution order (`src/lib/bff.ts resolveBatch`):
  1. exact canonical → 2. exact normalised alias → 3. compact match (strip non-alnum).
- Admin search (`BatchesPage`) matches canonical substring, alias substring,
  compact substring, and product name.
- Admin alias rules: 3–40 chars, not canonical-shaped, not repeating own batch,
  globally unique across all batches (compact-insensitive), max 20 per batch.
- Entry points: `RegisterBatchDialog` (aliases textarea), `AliasManager`
  (per-batch add/remove, mounted in `BatchDetailSheet`), `BulkImportPage`
  (optional trailing `,aliases` column, pipe-separated).
- Public result shows a "Vendor code X → verified as canonical Y" banner (`VerdictBand`).

## 3. Rules (agent MUST follow)

1. Canonical format never relaxes — only aliases are permissive.
2. Aliases never look like `BDL-…` canonical; register those as batches instead.
3. Alias uniqueness is global (canonical + alias namespaces share one index).
4. Every alias mutation writes an audit event (`Added/Removed batch alias`).
5. CSV import is all-or-nothing; alias column is optional but validated identically.
6. Public verify never reveals whether an unknown code is "fake" vs "typo" — keep `not_found` copy.
7. WCAG 2.2 AA: labels for every input, `aria-invalid`/`aria-describedby` wiring,
   min 44px targets, burgundy focus ring (see `src/index.css` tokens).

## 4. Skills

| Skill | File | Use when |
|---|---|---|
| batch-nomenclature | `agents/skills/batch-nomenclature/SKILL.md` | validating/typing any batch or alias |
| alias-resolution | `agents/skills/alias-resolution/SKILL.md` | public verify, admin search, reports |
| batch-admin | `agents/skills/batch-admin/SKILL.md` | register / edit / recall / import / aliases |
| deploy-batch-subdomain | `agents/skills/deploy-batch-subdomain/SKILL.md` | shipping `batch.bodylia.in` |

## 5. TDD harness (full pyramid)

| Layer | Command | Covers |
|---|---|---|
| Frontend units | `npm test` (vitest) | `batch-nomenclature.test.ts`, `batch-aliases.test.ts` (12 tests) |
| API contract | `npm run test:api` (Go, `bodyliabatch_test`) | public BFF + admin JWT + alias register/search (9 tests) |
| End-to-end | `npm run test:e2e` (Playwright, Chromium) | real Postgres + Go + Vite journeys (8 tests) |
| Types | `npm run typecheck` | `tsc --noEmit` clean |

Manual checklist before ship:
  - [ ] `BDL-FR-2509-0312` verifies genuine; `FR-2509-312` + `FR25090312` resolve to same record with banner.
  - [ ] Unknown `BDL-FN-2501-0001` shows not-found help, not an accusation.
  - [ ] Admin search for `VND-CN` finds `BDL-CN-2510-1180`.
  - [ ] Register with duplicate alias is blocked with the owning batch named.
  - [ ] CSV with bad alias row blocks the whole import.

## 6. Local services (Postgres + Go API + Vite)

- Databases: `bodyliabatch` (dev) + `bodyliabatch_test` (Go + Playwright), Postgres 17 via Postgres.app.
- Migrations: `backend-go/migrations/001_initial_schema.sql` (14 tables, canonical CHECK + product-code cross-check + global alias uniqueness),
  `002_seed_master_data.sql` (6 products, 4 sites, 4 batches, 6 aliases),
  `003_seed_coa_reports_users.sql` (28 COA rows, 6 staff incl. bcrypt `Bodylia@2026`, 4 reports + timelines + escalation).
- Runner: `backend-go/migrate.go` applies each file once (ledger `schema_migrations`); also `scripts/db-migrate.sh`, `scripts/db-reset.sh`, `scripts/services-up.sh`.
- API (Go + Gin, port 8101): `GET /api/health`, `GET /bff/v1/batches/:batch` (alias-aware genuine/expired/recalled/404 + DB rate limit),
  `POST /bff/v1/reports`, `POST /bff/v1/reports/track` (reference+email, no leak),
  `GET /bff/v1/recalls`, `POST /api/auth/login` (bcrypt + 15-min JWT), `/api/admin/*` (JWT: me, batches search/get/register, alias add/remove, all audited).
- Frontend seam: `src/lib/bff.ts` uses the Go service when `VITE_API_URL` is set (`npm run dev:api`), else the in-memory mock (unit tests/preview).
- E2e (`playwright.config.ts`, Chromium): `e2e/public-verify.spec.ts` (5 browser+API), `e2e/admin-batches.spec.ts` (3 API+browser).
- Ports: API 8101, Vite 5175 locally (5173/5174 are taken by other Docker projects on this machine), preview 4173.

## 7. Deploy (batch.bodylia.in)

- Static SPA (`dist/`), hash routing — no server rewrites needed.
- `deploy/nginx-batch-bodylia.conf` is the drop-in server block (HTTPS, `batch.bodylia.in`,
  QR deep links `/?b=BDL-…`).
- `deploy/Dockerfile` serves `dist/` via nginx. Build: `npm ci && npm run build`.
- Previews: `admin@bodylia.in / Bodylia@2026`, 2FA `246810`.

## 8. Playbook reconciliation (when PDFs are available)

Drop the 6 PDFs into `docs/playbooks/` and map:
- Architecture.pdf → confirm BFF routes in `src/lib/bff.ts` header; adjust `deploy/` to match.
- BatchPlan.pdf → confirm `BDL-<CODE>-YYMM-NNNN` + product codes; update `BATCH_PATTERN` if vendors differ.
- GoAPIs.pdf → replace mock BFF with real endpoints; keep `resolveBatch` contract server-side too.
- PostGresBackend.pdf → add `batches` + `batch_aliases(canonical_fk, alias UNIQUE)` tables + seed from `src/data/batches.ts`.
- RulesSkillsHarnessTDD.pdf → merge with this file; keep sections 3–5 as the executable subset.
- ScreenInventory.pdf → verify every admin route in `AdminApp`/`AdminShell` is listed; add missing screens.
