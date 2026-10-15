# Skill: batch-nomenclature

Enforce the canonical Bodylia batch format on batch.bodylia.in.

## Canonical
`BDL-<PRODUCT(2 letters)>-<YYMM>-<NNNN>` — e.g. `BDL-FR-2509-0312`.
Regex: `^BDL-[A-Z]{2}-\d{2}(0[1-9]|1[0-2])-\d{4}$` (`BATCH_PATTERN`, `CANONICAL_BATCH_PATTERN`).

## Normalisation
- Canonical input: `normaliseBatch()` — trim, UPPERCASE, spaces → `-`, collapse.
- Any printed code: `normaliseAlias()` — as above + `_ / .` → `-`, strip edge hyphens.
- Compact key: `compactKey()` — strip every non-alphanumeric (for punctuation-blind matching).

## Schemas (`src/lib/schemas.ts`)
- `batchNumberSchema` — STRICT canonical. Use for: admin register, CSV import.
- `batchLookupSchema` — PERMISSIVE (3–40 chars, needs [A-Z0-9]). Use for: public search, reports.
- `batchAliasSchema` — single vendor alias; rejects canonical-shaped values.

## Never
- Never relax `BATCH_PATTERN` to admit vendor codes — those are aliases.
- Never store aliases un-normalised; always run `normaliseAlias()` first.
- Product code must equal `batch.slice(4, 6)` at register/import time.
