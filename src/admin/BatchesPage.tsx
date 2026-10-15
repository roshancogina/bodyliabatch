import React, { useEffect, useMemo, useState } from 'react'
import { differenceInDays, format } from 'date-fns'
import { ArrowDown, ArrowUp, Download, Plus, Search, Upload } from 'lucide-react'
import type { StaffUser } from '../data/admin-seed'
import type { BatchRecord } from '../data/batches'
import { getProduct, listProducts } from '../lib/products'
import { useStore } from '../lib/store'
import { can } from '../lib/auth'
import { downloadCsv } from '../lib/pdf'
import { toast } from '../lib/toast'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Input, NativeSelect } from '../components/ui/input'
import { PageHeader } from './PageHeader'
import { BatchStatusBadge, batchState } from './BatchStatusBadge'
import { BatchDetailSheet } from './BatchDetailSheet'
import { RegisterBatchDialog } from './RegisterBatchDialog'
import type { Go } from './AdminShell'

type SortKey = 'batch' | 'product' | 'manufactured' | 'expires'
type Status = 'all' | 'in_date' | 'expired' | 'recalled' | 'expiring'

export function BatchesPage({ user, focus, go }: { user: StaffUser; focus?: string; go: Go }) {
  const batches = useStore((s) => s.batches)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [product, setProduct] = useState('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'manufactured', dir: -1 })
  const [openBatch, setOpenBatch] = useState<string | null>(focus ?? null)
  const [registering, setRegistering] = useState(false)

  useEffect(() => setOpenBatch(focus ?? null), [focus])

  const rows = useMemo(() => {
    const n = q.trim().toUpperCase()
    const compact = n.replace(/[^A-Z0-9]/g, '')
    const val = (b: BatchRecord) => (sort.key === 'product' ? getProduct(b.product).name : b[sort.key])
    return batches
      .filter((b) => {
        if (!n) return true
        // Canonical, alias (exact/substring), product name, or compact (punctuation-insensitive) match.
        if (b.batch.includes(n)) return true
        if ((b.aliases ?? []).some((a) => a.toUpperCase().includes(n))) return true
        if (compact && (b.batch.replace(/[^A-Z0-9]/g, '').includes(compact) || (b.aliases ?? []).some((a) => a.replace(/[^A-Z0-9]/g, '').includes(compact)))) return true
        return getProduct(b.product).name.toUpperCase().includes(n)
      })
      .filter((b) => {
        if (status === 'all') return true
        if (status === 'expiring') {
          const d = differenceInDays(new Date(b.expires), new Date())
          return b.status === 'released' && d >= 0 && d <= 120
        }
        return batchState(b) === status
      })
      .filter((b) => product === 'all' || b.product === product)
      .sort((a, b) => String(val(a)).localeCompare(String(val(b))) * sort.dir)
  }, [batches, q, status, product, sort])

  const selected = batches.find((b) => b.batch === openBatch) ?? null

  const exportCsv = () => {
    downloadCsv(`bodylia-batches-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['batch', 'product', 'manufactured', 'expires', 'status', 'facility', 'lab', 'aliases'],
      ...rows.map((b) => [b.batch, b.product, b.manufactured, b.expires, batchState(b), b.facility, b.lab, (b.aliases ?? []).join(' | ')]),
    ])
    toast('Export downloaded', { description: `${rows.length} batches as CSV` })
  }

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <th scope="col" aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className="py-1 pr-4 font-medium">
      <button
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))}
        className="inline-flex min-h-11 items-center gap-1 hover:text-graphite"
      >
        {label}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="size-3.5" aria-hidden="true" /> : <ArrowDown className="size-3.5" aria-hidden="true" />)}
      </button>
    </th>
  )

  return (
    <div>
      <PageHeader
        title="Batches"
        description="Every batch released for sale. Customers see exactly what’s recorded here, the moment you save."
        actions={
          <>
            <Button variant="ghost" onClick={exportCsv}>
              <Download aria-hidden="true" />
              Export CSV
            </Button>
            {can(user, 'batches.import') && (
              <Button variant="outline" onClick={() => go('import')}>
                <Upload aria-hidden="true" />
                Bulk import
              </Button>
            )}
            {can(user, 'batches.register') && (
              <Button onClick={() => setRegistering(true)}>
                <Plus aria-hidden="true" />
                Register batch
              </Button>
            )}
          </>
        }
      />

      <div role="search" className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="batch-q" className="text-sm font-semibold">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input id="batch-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Batch, vendor code, or product" className="pl-9" />
          </div>
          <p className="mt-1.5 text-xs text-muted">Tip: vendor-printed codes work too — e.g. FR-2509-312 finds BDL-FR-2509-0312.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="batch-status" className="text-sm font-semibold">Status</label>
          <NativeSelect id="batch-status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="all">All statuses</option>
            <option value="in_date">In date</option>
            <option value="expiring">Expiring within 120 days</option>
            <option value="expired">Expired</option>
            <option value="recalled">Recalled</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="batch-product" className="text-sm font-semibold">Product</label>
          <NativeSelect id="batch-product" value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="all">All products</option>
            {listProducts().map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </NativeSelect>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Saved views">
        {([['expiring', 'Expiring soon'], ['recalled', 'Recalled'], ['all', 'Everything']] as [Status, string][]).map(([s, l]) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={cn('inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150', status === s ? 'border-burgundy bg-burgundy text-white' : 'border-stone text-graphite hover:bg-sand')}
          >
            {l}
          </button>
        ))}
      </div>

      <p className="mt-6 text-sm text-muted" aria-live="polite">{rows.length} of {batches.length} batches</p>
      <div role="region" aria-label="Registered batches, sortable by column (scrolls sideways on small screens)" tabIndex={0} className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <caption className="sr-only">Registered batches, sortable by column</caption>
          <thead>
            <tr className="border-b border-gold text-muted">
              <SortHeader k="batch" label="Batch" />
              <SortHeader k="product" label="Product" />
              <SortHeader k="manufactured" label="Manufactured" />
              <SortHeader k="expires" label="Expires" />
              <th scope="col" className="py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((b) => (
              <tr key={b.batch} className="border-b border-mist">
                <th scope="row" className="py-1 pr-4 font-semibold">
                  <button onClick={() => setOpenBatch(b.batch)} className="inline-flex min-h-11 items-center text-burgundy underline decoration-1 underline-offset-4 hover:decoration-2">
                    {b.batch}
                  </button>
                  {(b.aliases ?? []).length > 0 && (
                    <span className="tabular mt-0.5 block text-xs font-normal text-muted">
                      also: {(b.aliases ?? []).slice(0, 3).join(', ')}{(b.aliases ?? []).length > 3 ? ` +${(b.aliases ?? []).length - 3} more` : ''}
                    </span>
                  )}
                </th>
                <td className="py-1 pr-4 text-graphite">{getProduct(b.product).name}</td>
                <td className="py-1 pr-4 text-graphite">{format(new Date(b.manufactured), 'd MMM yyyy')}</td>
                <td className="py-1 pr-4 text-graphite">{format(new Date(b.expires), 'd MMM yyyy')}</td>
                <td className="py-1"><BatchStatusBadge b={b} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-graphite">No batches match these filters.</p>}
      </div>

      <BatchDetailSheet user={user} batch={selected} onClose={() => setOpenBatch(null)} go={go} />
      <RegisterBatchDialog user={user} open={registering} onOpenChange={setRegistering} onRegistered={(b) => setOpenBatch(b)} />
    </div>
  )
}
