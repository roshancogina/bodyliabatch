import React, { useState } from 'react'
import { format } from 'date-fns'
import { AlertOctagon, FileText, Pencil, RotateCcw } from 'lucide-react'
import type { StaffUser } from '../data/admin-seed'
import type { BatchRecord } from '../data/batches'
import { getProduct } from '../lib/products'
import { useStore } from '../lib/store'
import { can } from '../lib/auth'
import { Sheet } from '../components/ui/sheet'
import { Button } from '../components/ui/button'
import { BatchStatusBadge } from './BatchStatusBadge'
import { RecallDialog } from './RecallDialog'
import { LiftRecallDialog } from './batches/LiftRecallDialog'
import { EditBatchDialog } from './batches/EditBatchDialog'
import { AliasManager } from './batches/AliasManager'
import type { Go } from './AdminShell'

export function BatchDetailSheet({ user, batch, onClose, go }: { user: StaffUser; batch: BatchRecord | null; onClose: () => void; go: Go }) {
  const [dialog, setDialog] = useState<null | 'recall' | 'lift' | 'edit'>(null)
  const reports = useStore((s) => s.reports)
  const audit = useStore((s) => s.audit)
  if (!batch) return <Sheet open={false} onOpenChange={() => onClose()} title="">{null}</Sheet>

  const p = getProduct(batch.product)
  // Related reports may carry the canonical code OR any vendor alias for this batch.
  const related = reports.filter((r) => {
    const norm = r.batch.trim().toUpperCase()
    return norm === batch.batch || (batch.aliases ?? []).includes(norm)
  })
  const history = audit.filter((a) => a.target === batch.batch)
  const fmt = (d: string) => format(new Date(d), 'd MMM yyyy')
  const checks = lookupSeries(batch.batch)
  const maxC = Math.max(...checks, 1)

  return (
    <>
      <Sheet
        open
        onOpenChange={(o) => !o && onClose()}
        title={batch.batch}
        description={`${p.name} · ${p.format}`}
        footer={
          <div className="flex flex-wrap gap-2">
            {can(user, 'batches.edit') && (
              <Button variant="outline" onClick={() => setDialog('edit')}>
                <Pencil aria-hidden="true" />
                Edit details
              </Button>
            )}
            {can(user, 'batches.recall') &&
              (batch.status === 'recalled' ? (
                <Button variant="outline" onClick={() => setDialog('lift')}>
                  <RotateCcw aria-hidden="true" />
                  Lift recall
                </Button>
              ) : (
                <Button variant="outline" className="border-error text-error hover:bg-error-bg" onClick={() => setDialog('recall')}>
                  <AlertOctagon aria-hidden="true" />
                  Recall this batch
                </Button>
              ))}
            {!can(user, 'batches.edit') && <p className="text-sm text-muted">View only — your role can’t edit or recall batches.</p>}
          </div>
        }
      >
        <div className="flex items-center gap-4">
          <div className="flex size-20 shrink-0 items-end justify-center rounded-md bg-sand p-2">
            <img src={p.image} alt="" className="max-h-full w-auto" />
          </div>
          <div>
            <BatchStatusBadge b={batch} />
            {batch.recallReason && <p className="mt-2 text-sm text-graphite">{batch.recallReason}</p>}
          </div>
        </div>

        <dl className="mt-6 border-t border-gold text-sm">
          {[
            ['Manufactured', fmt(batch.manufactured)],
            ['Expires', fmt(batch.expires)],
            ['Facility', batch.facility],
            ['Testing lab', batch.lab],
            ['First public check', batch.firstCheckedAt ? fmt(batch.firstCheckedAt) : 'Not yet checked — free to edit'],
            ['Lab certificate', batch.coaFileName ?? 'Generated from results'],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[9rem_1fr] gap-4 border-b border-mist py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="tabular text-graphite">{v}</dd>
            </div>
          ))}
        </dl>

        <h3 className="mt-8 font-semibold text-graphite">Public checks, last 14 days</h3>
        <p className="text-sm text-muted">
          <span className="tabular font-semibold text-graphite">{checks.reduce((a, b) => a + b, 0)}</span> checks · peak {Math.max(...checks)} in a day
        </p>
        <div className="mt-2 flex h-16 items-end gap-1" aria-hidden="true">
          {checks.map((c, i) => (
            <div key={i} className="flex-1 rounded-t-sm bg-taupe" style={{ height: `${(c / maxC) * 100}%` }} />
          ))}
        </div>
        <p className="sr-only">Daily checks oldest first: {checks.join(', ')}</p>

        <h3 className="mt-8 font-semibold text-graphite">Lab results</h3>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Lab results for {batch.batch}</caption>
          <thead>
            <tr className="border-b border-mist text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">Test</th>
              <th scope="col" className="py-2 pr-3 font-medium">Result</th>
              <th scope="col" className="py-2 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {batch.coa.map((r) => (
              <tr key={r.test} className="border-b border-mist">
                <th scope="row" className="py-2 pr-3 font-medium text-graphite">{r.test}</th>
                <td className="py-2 pr-3 text-graphite">{r.result} <span className="text-muted">({r.specification})</span></td>
                <td className={r.pass ? 'py-2 font-semibold text-success' : 'py-2 font-semibold text-error'}>{r.pass ? 'Pass' : 'Fail'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <AliasManager user={user} batch={batch} />

        <h3 className="mt-8 font-semibold text-graphite">Customer reports ({related.length})</h3>
        {related.length === 0 ? (
          <p className="mt-1 text-sm text-muted">None.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {related.map((r) => (
              <li key={r.reference} className="text-graphite">
                <button onClick={() => go('reports', { report: r.reference })} className="tabular inline-flex min-h-11 items-center gap-1.5 font-semibold text-burgundy underline underline-offset-4">
                  <FileText className="size-4" aria-hidden="true" /> {r.reference}
                </button>{' '}
                — {r.message}
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-8 font-semibold text-graphite">History</h3>
        {history.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No recorded changes.</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="text-graphite">
                <span className="text-muted">{format(new Date(h.at), 'd MMM yyyy, HH:mm')}</span> · {h.actor} · {h.action}
                {h.detail && <span className="text-muted"> — {h.detail}</span>}
              </li>
            ))}
          </ol>
        )}
      </Sheet>
      <RecallDialog user={user} batch={batch.batch} open={dialog === 'recall'} onOpenChange={(o) => setDialog(o ? 'recall' : null)} />
      <LiftRecallDialog user={user} batch={batch.batch} open={dialog === 'lift'} onOpenChange={(o) => setDialog(o ? 'lift' : null)} />
      <EditBatchDialog user={user} batch={batch} open={dialog === 'edit'} onOpenChange={(o) => setDialog(o ? 'edit' : null)} />
    </>
  )
}

/** Deterministic per-batch preview series (production: lookups table, Book 3 §2). */
function lookupSeries(batch: string) {
  let h = 0
  for (const c of batch) h = (h * 31 + c.charCodeAt(0)) | 0
  return Array.from({ length: 14 }, (_, i) => {
    h = (h * 1103515245 + 12345) & 0x7fffffff
    return 2 + (h % 9) + (i > 9 ? 3 : 0)
  })
}
