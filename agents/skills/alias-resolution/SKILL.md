# Skill: alias-resolution

Resolve ANY printed code to one canonical batch so search works "in multiple ways".

## Resolver (`src/lib/bff.ts`)
`resolveBatch(raw)` → `{ record, matchedAlias? } | null`. Order:
1. exact canonical (`b.batch === norm`)
2. exact normalised alias (`(b.aliases ?? []).map(normaliseAlias).includes(norm)`)
3. compact match (`compactKey` equality on batch or any alias)

`searchBatches(query)` — admin list filter: canonical/alias substring OR compact
substring on either field. Empty query returns everything.

## Public UX
- `lookupBatch()` calls `resolveBatch()`; unknown → `not_found` (neutral copy, never "fake").
- Matched-via-alias results carry `matchedAlias`; `VerdictBand` renders
  "Vendor code X → verified as canonical Y".
- First public check stamps `firstCheckedAt` (later admin edits need a reason).

## Admin UX
- `BatchesPage` search box accepts canonical, alias, compact, or product name.
- Table rows show up to 3 aliases under the canonical number.
- CSV export includes an `aliases` column (` | `-joined).

## Testing
`src/lib/batch-aliases.test.ts` covers exact/canonical/compact/unknown + admin search.
Add a case per new vendor format discovered in the wild.
