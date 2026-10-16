# UIBatch Coding Standard — XX-NNNN-XXNN — Test Scenarios

Canonical: **XX-NNNN-XXNN** — 2 alphanumerics (A–Z, 0–9), hyphen, 4 digits,
hyphen, 2 alphanumerics + 2 digits (e.g. `PE-2610-WL01`). Spaces are
stripped/ignored everywhere. The XX prefix identifies the product
(PE = PeriHarmon); register/import cross-checks enforce it.
Manufacturer batch codes and label batch codes map per-batch as aliases
(`manufacturer` | `label` kind); entering ANY mapped code returns the same product details.

## 1. Format matrix (pattern)

| Input | Expected | Covered in |
|---|---|---|
| `PE-2610-WL01`, `FE-2610-WL01`, `AB-0000-CD00` | valid | vitest `uibatch-standard`, Go `nomenclature_test` |
| `F-2610-WL01` (1-char prefix) | invalid (prefix) | same |
| `PE-261-WL01`, `PE-261A-WL01`, `PE-26100-WL01` | invalid (middle) | same |
| `PE-2610-WL0`, `PE-2610-WL0B`, `PE-2610-01WL` | invalid (serial) | same |
| `PE2610WL01` (raw), `PE--2610--WL01`, `-PE-…`, `PE-…-` | invalid raw / normalised | same |
| `PE-2610-WL01-X`, `PE-2610`, `BDL-PE-2610-WL01`, `!`/`#` suffix | invalid | same |

## 2. Space stripping

| Input | Normalised | Covered in |
|---|---|---|
| `pe 2610 wl01` | `PE-2610-WL01` | vitest, Go, e2e spaced-input journey |
| `  PE - 2610 - WL01  `, `P E - 2 6 1 0 - W L 0 1` | `PE-2610-WL01` | vitest, Go |
| `PE2610WL01` | `PE-2610-WL01` (hyphens auto-inserted) | vitest, Go |

## 3. Sensible per-position errors (exact strings pinned)

| Input | Message contains | Covered in |
|---|---|---|
| `` (empty/spaces) | `Enter the batch number printed on your pack.` | vitest, Go |
| `F-2610-WL01` | `first 2 characters` | vitest, Go, e2e malformed journey |
| `PE-261-WL01`, `PE-25A0-WL01` | `middle 4 characters must be digits` | vitest, Go |
| `PE-2610-WL0`, `PE-2610-01WL` | `last 4 characters` | vitest, Go |
| `PE-2610` | `2 characters, a hyphen, 4 digits` | vitest, Go |
| `PE2610WL01!` | `only use letters, digits, spaces and hyphens` | vitest, Go |
| valid codes | no error (`null`/`""`) | vitest, Go |

## 4. Strict zod validation (register/import)

Accepts canonical incl. spaced/compact input; rejects product mismatch
(`CI` product with `PE-…` batch), bad dates, future manufacture, failed COA,
alias repeating batch, canonical-shaped alias, dupes, 1–2 char aliases,
21+ aliases. CSV row schema: same + pipe-separated alias parsing.
Covered in: `src/admin/admin-schemas.test.ts` (register + CSV + all misc schemas).

## 5. Mapping — manufacturer/label codes

| Entered | Resolves to | Kind surfaced | Covered in |
|---|---|---|---|
| `PE-2610-WL01` (canonical) | same record, no banner | — | vitest `uibatch-aliases`, Go BFF, e2e, Playwright API |
| `2K26001` | `PE-2610-WL01` | `manufacturer` | vitest, Go, e2e, Playwright |
| `2K26005` | `CI-2610-WL01` | `manufacturer` | vitest, Go, e2e, Playwright |
| `pe 2610 wl01`, `PE2610WL01` | `PE-2610-WL01` | — (canonical path) | vitest, Go, e2e |
| `ZZ-9999-9Z99` / unknown | `not_found` (neutral copy) | — | Go BFF, e2e |
| Admin search `2K26005` | `CI-2610-WL01` | — | Go admin API, Playwright |
| Register with `{code, kind}` ×2 → each verifies | new batch | kinds kept | Playwright |
| Duplicate mapped code | 400/409 naming owner | — | Go admin API, Playwright |
| Alias shaped like `XX-NNNN-XXNN` | rejected (`map it as a batch`) | — | vitest, Go `isValidAlias` |

## 5a. First production batch (NOV 2026 → APR 2028, qty 1000 each)

| Product | Type | Our batch | Mfr code | MRP |
|---|---|---|---|---|
| PERIHARMON | CAPSULE | PE-2610-WL01 | 2K26001 | 1399 |
| FERRIMUNE | CAPSULE | FE-2610-WL01 | 2K26002 | 1199 |
| FERTILINOVA | CAPSULE | FN-2610-WL01 | 2K26003 | 1499 |
| MATERNABLOOM | CAPSULE | MB-2610-WL01 | 2K26004 | 1399 |
| CINDORIA | SACHET | CI-2610-WL01 | 2K26005 | 1899 |

Seeded by `005_first_batch.sql` (+ `qty`/`mrp` columns); result page shows
pack quantity + MRP. E2e asserts `1000` + `1,399` on the genuine page.

## 6. Coverage (100% statements/functions/lines/branches on the standard)

- Frontend: `npx vitest run --coverage` → **Statements/Functions/Lines/Branches 100%**
  (utils, lib/schemas, bff, data/batches, admin/schemas, captcha).
- Backend: `go test` → 19 tests incl. `nomenclature_test.go` mirroring every
  frontend scenario (pattern/space/errors) + BFF/admin contract tests +
  login PoW (`TestCaptchaLoginRequiresToken`).
- E2e: `npx playwright test` → canonical, manufacturer, spaced,
  malformed-error, unknown, custom-404, register+verify, duplicate-reject journeys.

## 7a. Captcha (self-hosted proof-of-work, all unauthenticated entry forms)

- `src/lib/captcha.ts` + `backend-go/captcha.go` (mirrored SHA-256 PoW, difficulty 3).
- Widget: `src/components/CaptchaField.tsx` (auto-solve, retry, test bypass).
- Covered: verify (BatchSearchForm), report (ReportForm), track (TrackReport),
  feedback (ShareFeedback), sign-in (SignIn), forgot-password (ForgotPassword),
  invite/reset links (NewPasswordForm). Post-login staff dialogs exempt (JWT).
- Backend: `requireCaptcha` on reports submit/track + login (`handleLogin`);
  Playwright solves PoW via node:crypto helper (no bypass flag in e2e).

## 7. Environments & isolation

Dev/test/prod split in `AGENTS.md §6`; mock fixtures throw in prod builds;
`*_test` DB guards; prod boot requires real secrets (see `backend-go/env_guard.go`).
