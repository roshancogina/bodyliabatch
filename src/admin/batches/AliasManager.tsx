import React, { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { StaffUser } from '../../data/admin-seed'
import { aliasCode, type BatchAlias, type BatchRecord } from '../../data/batches'
import { store } from '../../lib/store'
import { normaliseAlias, compactKey } from '../../lib/utils'
import { BATCH_PATTERN, type AliasKind } from '../../lib/schemas'
import { toast } from '../../lib/toast'
import { can } from '../../lib/auth'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'

export function AliasManager({ user, batch }: { user: StaffUser; batch: BatchRecord }) {
  const [value, setValue] = useState('')
  const [kind, setKind] = useState<AliasKind>('manufacturer')
  const [error, setError] = useState<string | null>(null)
  const editable = can(user, 'batches.edit')
  const aliases: BatchAlias[] = (batch.aliases ?? []).map((a) =>
    typeof a === 'string' ? { code: a, kind: 'manufacturer' as const } : a,
  )
  const codes = aliases.map((a) => a.code)

  const validate = (raw: string): string | null => {
    const norm = normaliseAlias(raw)
    if (!norm) return 'Enter a manufacturer or label code.'
    if (norm.length < 3) return 'Each mapped code needs at least 3 characters.'
    if (norm.length > 40) return 'Each mapped code must be 40 characters or fewer.'
    if (!/[A-Z0-9]/.test(norm)) return 'Each mapped code must contain a letter or number.'
    if (norm === batch.batch) return 'A mapped code cannot repeat the canonical batch number.'
    if (BATCH_PATTERN.test(norm)) return 'That looks like a canonical XX-NNNN-NNNN code — register it as a batch instead.'
    if (codes.includes(norm)) return `"${norm}" is already mapped to this batch.`
    const clash = store.get().batches.find(
      (b) => b.batch !== batch.batch &&
        (b.batch === norm || compactKey(b.batch) === compactKey(norm) ||
          (b.aliases ?? []).some((a) => {
            const c = aliasCode(a)
            return c === norm || compactKey(c) === compactKey(norm)
          })),
    )
    if (clash) return `"${norm}" is already used by ${clash.batch}. Mapped codes must be unique.`
    return null
  }

  const add = () => {
    const parts = value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
    if (!parts.length) { setError('Enter at least one manufacturer or label code.'); return }
    if (aliases.length + parts.length > 20) { setError('At most 20 mapped codes per batch.'); return }
    for (const p of parts) { const err = validate(p); if (err) { setError(err); return } }
    const norms = parts.map((p) => normaliseAlias(p))
    const entries: BatchAlias[] = norms.map((code) => ({ code, kind }))
    store.set((s) => ({
      batches: s.batches.map((b) => (b.batch === batch.batch ? { ...b, aliases: [...(b.aliases ?? []), ...entries] } : b)),
    }))
    store.audit(user.name, norms.length === 1 ? 'Mapped batch code' : 'Mapped batch codes', batch.batch, `${kind}: ${norms.join(', ')}`)
    toast(norms.length === 1 ? `${kind === 'label' ? 'Label' : 'Manufacturer'} code ${norms[0]} mapped` : `${norms.length} ${kind} codes mapped`, {
      description: `Customers can now verify ${batch.batch} with ${norms.length === 1 ? 'this code' : 'these codes'}.`,
    })
    setValue(''); setError(null)
  }

  const remove = (alias: string) => {
    store.set((s) => ({
      batches: s.batches.map((b) => (b.batch === batch.batch ? { ...b, aliases: (b.aliases ?? []).filter((a) => aliasCode(a) !== alias) } : b)),
    }))
    store.audit(user.name, 'Removed mapped batch code', batch.batch, alias)
    toast(`Mapped code ${alias} removed`, { description: `${batch.batch} keeps its canonical number.` })
  }


  return (
    <section aria-labelledby="aliases-heading" className="mt-8 border-t border-mist pt-6">
      <h3 id="aliases-heading" className="font-semibold text-graphite">
        Mapped batch codes <span className="font-normal text-muted">({aliases.length}/20)</span>
      </h3>
      <p className="mt-1 text-sm text-muted">
        Manufacturer and label codes for this exact batch. Canonical stays{' '}
        <span className="tabular font-semibold text-graphite">{batch.batch}</span> — every mapped code verifies to the same record.
      </p>
      {aliases.length === 0 ? (
        <p className="mt-3 text-sm text-muted">None yet. Map the first manufacturer or label code below.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Mapped batch codes for ${batch.batch}`}>
          {aliases.map((a) => (
            <li key={a.code} className="tabular inline-flex min-h-11 items-center gap-2 rounded-full border border-stone bg-white px-3.5 py-1.5 text-sm font-semibold text-graphite">
              <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-semibold text-muted">{a.kind}</span>
              {a.code}
              {editable && (
                <button type="button" onClick={() => remove(a.code)} aria-label={`Remove mapped code ${a.code}`}
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
          <label htmlFor={`alias-input-${batch.batch}`} className="text-sm font-semibold text-graphite">Map batch code</label>
          <p id={`alias-input-${batch.batch}-desc`} className="mt-0.5 text-sm text-muted">One or several codes, comma-separated. Spaces and case are normalised automatically.</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`alias-kind-${batch.batch}`} className="sr-only">Code kind</label>
            <select
              id={`alias-kind-${batch.batch}`}
              value={kind}
              onChange={(e) => setKind(e.target.value as AliasKind)}
              className="flex min-h-11 rounded-md border border-taupe bg-white px-3 text-sm font-semibold text-graphite"
            >
              <option value="manufacturer">Manufacturer code</option>
              <option value="label">Label code</option>
            </select>
            <Input id={`alias-input-${batch.batch}`} value={value}
              onChange={(e) => { setValue(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              placeholder="e.g. 2K26006, LBL-PE-0001" autoCapitalize="characters" spellCheck={false}
              aria-describedby={error ? `alias-input-${batch.batch}-desc alias-input-${batch.batch}-err` : `alias-input-${batch.batch}-desc`}
              aria-invalid={!!error} className="tabular font-semibold tracking-wide sm:flex-1" />
            <Button type="button" onClick={add} className="sm:w-auto"><Plus aria-hidden="true" />Map code</Button>
          </div>
          {error && <p id={`alias-input-${batch.batch}-err`} role="alert" className="mt-1.5 text-sm font-medium text-error">{error}</p>}
        </div>
      )}
      {!editable && aliases.length > 0 && <p className="mt-2 text-sm text-muted">View only — your role cannot edit mapped codes.</p>}
    </section>
  )
}
