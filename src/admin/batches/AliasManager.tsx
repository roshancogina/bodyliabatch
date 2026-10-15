import React, { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { StaffUser } from '../../data/admin-seed'
import type { BatchRecord } from '../../data/batches'
import { store } from '../../lib/store'
import { normaliseAlias, compactKey } from '../../lib/utils'
import { BATCH_PATTERN } from '../../lib/schemas'
import { toast } from '../../lib/toast'
import { can } from '../../lib/auth'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'

export function AliasManager({ user, batch }: { user: StaffUser; batch: BatchRecord }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const editable = can(user, 'batches.edit')
  const aliases = batch.aliases ?? []

  const validate = (raw: string): string | null => {
    const norm = normaliseAlias(raw)
    if (!norm) return 'Enter a vendor code.'
    if (norm.length < 3) return 'Each alias needs at least 3 characters.'
    if (norm.length > 40) return 'Each alias must be 40 characters or fewer.'
    if (!/[A-Z0-9]/.test(norm)) return 'Each alias must contain a letter or number.'
    if (norm === batch.batch) return 'An alias cannot repeat the canonical batch number.'
    if (BATCH_PATTERN.test(norm)) return 'That looks like a canonical BDL- number — register it as a batch instead.'
    if (aliases.includes(norm)) return `"${norm}" is already listed for this batch.`
    const clash = store.get().batches.find(
      (b) => b.batch !== batch.batch &&
        (b.batch === norm || compactKey(b.batch) === compactKey(norm) ||
          (b.aliases ?? []).some((a) => a === norm || compactKey(a) === compactKey(norm))),
    )
    if (clash) return `"${norm}" is already used by ${clash.batch}. Aliases must be unique.`
    return null
  }

  const add = () => {
    const parts = value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
    if (!parts.length) { setError('Enter at least one vendor code.'); return }
    if (aliases.length + parts.length > 20) { setError('At most 20 aliases per batch.'); return }
    for (const p of parts) { const err = validate(p); if (err) { setError(err); return } }
    const norms = parts.map((p) => normaliseAlias(p))
    store.set((s) => ({
      batches: s.batches.map((b) => (b.batch === batch.batch ? { ...b, aliases: [...(b.aliases ?? []), ...norms] } : b)),
    }))
    store.audit(user.name, norms.length === 1 ? 'Added batch alias' : 'Added batch aliases', batch.batch, norms.join(', '))
    toast(norms.length === 1 ? `Alias ${norms[0]} added` : `${norms.length} aliases added`, {
      description: `Customers can now verify ${batch.batch} with ${norms.length === 1 ? 'this vendor code' : 'these vendor codes'}.`,
    })
    setValue(''); setError(null)
  }

  const remove = (alias: string) => {
    store.set((s) => ({
      batches: s.batches.map((b) => (b.batch === batch.batch ? { ...b, aliases: (b.aliases ?? []).filter((a) => a !== alias) } : b)),
    }))
    store.audit(user.name, 'Removed batch alias', batch.batch, alias)
    toast(`Alias ${alias} removed`, { description: `${batch.batch} keeps its canonical number.` })
  }


  return (
    <section aria-labelledby="aliases-heading" className="mt-8 border-t border-mist pt-6">
      <h3 id="aliases-heading" className="font-semibold text-graphite">
        Vendor aliases <span className="font-normal text-muted">({aliases.length}/20)</span>
      </h3>
      <p className="mt-1 text-sm text-muted">
        Other lot codes printed by vendors for this exact batch. Canonical stays{' '}
        <span className="tabular font-semibold text-graphite">{batch.batch}</span> — every alias verifies to the same record.
      </p>
      {aliases.length === 0 ? (
        <p className="mt-3 text-sm text-muted">None yet. Add the first vendor code below.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Vendor aliases for ${batch.batch}`}>
          {aliases.map((a) => (
            <li key={a} className="tabular inline-flex min-h-11 items-center gap-2 rounded-full border border-stone bg-white px-3.5 py-1.5 text-sm font-semibold text-graphite">
              {a}
              {editable && (
                <button type="button" onClick={() => remove(a)} aria-label={`Remove alias ${a}`}
                  className="inline-flex size-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-error-bg hover:text-error">
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="mt-4">
          <label htmlFor={`alias-input-${batch.batch}`} className="text-sm font-semibold text-graphite">Add vendor alias</label>
          <p id={`alias-input-${batch.batch}-desc`} className="mt-0.5 text-sm text-muted">One or several codes, comma-separated. Spaces, slashes and case are normalised automatically.</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input id={`alias-input-${batch.batch}`} value={value}
              onChange={(e) => { setValue(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              placeholder="e.g. FR-2509-312, VND-FR-0312" autoCapitalize="characters" spellCheck={false}
              aria-describedby={error ? `alias-input-${batch.batch}-desc alias-input-${batch.batch}-err` : `alias-input-${batch.batch}-desc`}
              aria-invalid={!!error} className="tabular font-semibold tracking-wide sm:flex-1" />
            <Button type="button" onClick={add} className="sm:w-auto"><Plus aria-hidden="true" />Add alias</Button>
          </div>
          {error && <p id={`alias-input-${batch.batch}-err`} role="alert" className="mt-1.5 text-sm font-medium text-error">{error}</p>}
        </div>
      )}
      {!editable && aliases.length > 0 && <p className="mt-2 text-sm text-muted">View only — your role cannot edit aliases.</p>}
    </section>
  )
}
