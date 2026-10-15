# Skill: batch-admin

Manage batches and their vendor aliases in the console.

## Register (`RegisterBatchDialog` + `registerBatchSchema`)
- Canonical (strict) + product/date/facility/lab/COA as before.
- New: `aliases` textarea — comma/newline/semicolon-separated, normalised by
  `parseAliases()`. Validations: ≤20, no dupes, none canonical-shaped, none
  repeating own batch, each 3–40 chars with [A-Z0-9].
- Global uniqueness check at submit: alias must not equal any other canonical or
  alias (error names the owning batch). Audit: `Registered batch` with alias list.

## Edit aliases (`AliasManager`, mounted in `BatchDetailSheet`)
- Requires `batches.edit` permission; support role sees read-only.
- Add: one or many comma-separated; same validation + compact-insensitive clash
  check; audit `Added batch alias(es)`.
- Remove: per-alias × button; audit `Removed batch alias`.
- Cap: 20 per batch (counter in heading).

## Bulk import (`BulkImportPage` + `csvRowSchema`)
- Header: `batch,product,manufactured,expires,facility,lab` with optional trailing `,aliases`.
- Aliases cell: pipe- or semicolon-separated (`A | B`). Same per-alias rules +
  file-level checks: already-registered, twice-in-file (batch and alias).
- All-or-nothing: any bad row blocks the import.

## Recall / edit / reports
- Unchanged, but related reports now also match when the customer typed an alias
  (report stores the normalised input; admin detail matches canonical + aliases).
