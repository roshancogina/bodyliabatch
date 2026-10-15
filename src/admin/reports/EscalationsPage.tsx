import React, { useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, CornerUpLeft } from 'lucide-react'
import type { StaffUser, SuspiciousReport } from '../../data/admin-seed'
import { store, useStore } from '../../lib/store'
import { toast } from '../../lib/toast'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Textarea } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { PageHeader } from '../PageHeader'
import { returnEscalationSchema } from '../schemas'
import type { Go } from '../AdminShell'

export function EscalationsPage({ user, go }: { user: StaffUser; go: Go }) {
  const reports = useStore((s) => s.reports.filter((r) => r.escalation))
  const batches = useStore((s) => s.batches)
  const [returning, setReturning] = useState<SuspiciousReport | null>(null)
  const open = reports.filter((r) => r.escalation!.state === 'open').sort((a, b) => (a.escalation!.urgency === 'urgent' ? -1 : 1) - (b.escalation!.urgency === 'urgent' ? -1 : 1))
  const handled = reports.filter((r) => r.escalation!.state !== 'open')

  const accept = (r: SuspiciousReport) => {
    store.updateReport(r.reference, { escalation: { ...r.escalation!, state: 'accepted', handledBy: user.name }, assignee: user.name }, { by: user.name, kind: 'escalation', text: `Escalation accepted by ${user.name}` })
    store.audit(user.name, 'Accepted escalation', r.reference)
    toast(`You own ${r.reference} now`, { description: 'Support has been told quality is handling it.' })
    go('reports', { report: r.reference })
  }

  return (
    <div>
      <PageHeader
        title={open.length ? `${open.length} escalation${open.length > 1 ? 's' : ''} need a quality decision` : 'No open escalations'}
        description="Support escalates reports the batch record can’t answer. Accept to take ownership, or return with guidance."
      />
      <section aria-labelledby="esc-open" className="mt-6">
        <h2 id="esc-open" className="sr-only">Open escalations</h2>
        {open.length === 0 ? (
          <p className="rounded-md bg-sand p-5 text-graphite">Nothing waiting. Support isn’t blocked on quality.</p>
        ) : (
          <ul className="divide-y divide-mist border-y border-mist">
            {open.map((r) => {
              const known = batches.some((b) => b.batch === r.batch)
              return (
                <li key={r.reference} className="grid gap-4 py-5 lg:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.escalation!.urgency === 'urgent' ? <Badge tone="error">Urgent</Badge> : <Badge>Standard</Badge>}
                      <button onClick={() => go('reports', { report: r.reference })} className="tabular font-semibold text-burgundy underline underline-offset-4">{r.reference}</button>
                      <span className="tabular text-sm text-muted">{r.batch}{!known && ' · unregistered'}</span>
                    </div>
                    <p className="mt-2 text-graphite">{r.escalation!.reason}</p>
                    <p className="mt-1 text-sm text-muted">From {r.escalation!.by}, {formatDistanceToNowStrict(new Date(r.escalation!.at))} ago · customer said: “{r.message}”</p>
                  </div>
                  <div className="flex gap-2 lg:flex-col">
                    <Button onClick={() => accept(r)}>
                      <Check aria-hidden="true" />
                      Accept<span className="sr-only"> {r.reference}</span>
                    </Button>
                    <Button variant="outline" onClick={() => setReturning(r)}>
                      <CornerUpLeft aria-hidden="true" />
                      Return<span className="sr-only"> {r.reference}</span>
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {handled.length > 0 && (
        <section aria-labelledby="esc-done" className="mt-12">
          <h2 id="esc-done" className="text-lg font-semibold text-graphite">Recently handled</h2>
          <ul className="mt-2 text-sm">
            {handled.map((r) => (
              <li key={r.reference} className="border-b border-mist py-2.5 text-graphite">
                <span className="tabular font-semibold">{r.reference}</span> — {r.escalation!.state === 'accepted' ? `accepted by ${r.escalation!.handledBy}` : `returned by ${r.escalation!.handledBy}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ReturnDialog user={user} report={returning} onClose={() => setReturning(null)} />
    </div>
  )
}

function ReturnDialog({ user, report, onClose }: { user: StaffUser; report: SuspiciousReport | null; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ reason: string }>({ resolver: zodResolver(returnEscalationSchema), defaultValues: { reason: '' } })
  if (!report) return null
  return (
    <Dialog open onOpenChange={(o) => { if (!o) { reset(); onClose() } }}>
      <DialogContent title={`Return ${report.reference} to support`} description="Support will see your guidance in the report timeline." className="max-w-lg">
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={handleSubmit(({ reason }) => {
            store.updateReport(report.reference, { escalation: { ...report.escalation!, state: 'returned', handledBy: user.name } }, { by: user.name, kind: 'escalation', text: `Returned to support: ${reason}` })
            store.audit(user.name, 'Returned escalation', report.reference)
            toast('Returned to support')
            reset()
            onClose()
          })}
        >
          <FormField id="ret-reason" label="Guidance for support" description="e.g. Batch record is clean; colour variation is within spec — reply with the genuine template." error={errors.reason?.message}>
            {(a) => <Textarea {...a} {...register('reason')} />}
          </FormField>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Return to support</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
