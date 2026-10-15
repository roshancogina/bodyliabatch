# Batch Search Site → batch.bodylia.in

Bodylia batch verification portal (public verify + staff console). Exported from Magic Patterns, now set up as the `batch.bodylia.in` project.

## Getting started

1. `npm install`
2. `npm run dev` (serves the portal; QR deep links use `?b=BDL-…`)
3. `npm test` — alias + nomenclature TDD suite (12 tests)
4. `npm run build` — static `dist/` for `batch.bodylia.in`

## Batch nomenclature

- Canonical: `BDL-<PRODUCT>-<YYMM>-<NNNN>` e.g. `BDL-FR-2509-0312` (strict, enforced at register/import).
- Vendor aliases: any lot format a vendor prints (e.g. `FR-2509-312`, `VND-FR-0312`, `FR25090312`).
  Admin adds them per batch (detail sheet → Vendor aliases, register dialog, or CSV `,aliases` column).
  Public + admin search resolve either spelling to the same canonical record.

## Docs

- `AGENTS.md` — agent harness (rules, skills, TDD, deploy, playbook reconciliation).
- `agents/skills/*` — batch-nomenclature, alias-resolution, batch-admin, deploy-batch-subdomain.
- `deploy/` — nginx server block, Dockerfile, compose snippet for `batch.bodylia.in`.
- `docs/playbooks/` — drop the 6 PDF playbooks here when shareable (see AGENTS.md §7).

## Preview logins

- `admin@bodylia.in / Bodylia@2026`, 2FA `246810` (preview only).

