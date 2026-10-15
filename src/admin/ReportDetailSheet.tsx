import React, { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowUpRight, ImageIcon, Mail, UserPlus } from 'lucide-react'
import { STATUS_LABEL, type StaffUser, type SuspiciousReport, type TimelineKind } from '../data/admin-seed'
import { getProduct } from '../lib/products'
import { store, useStore } from '../lib/store'
import { can } from '../lib/auth'
import { toast } from '../lib/toast'
import { Sheet } from '../components/ui/sheet'
import { Button } from '../components/ui/button'
import { NativeSelect, Textarea } from '../components/ui/input'
import { FormField } from '../components/ui/form-field'
import { ReportStatusBadge } from './ReportStatusBadge'
import { BatchStatusBadge } from './BatchStatusBadge'
import { ReplyComposer } from './reports/ReplyComposer'
import { EscalateDialog } from './reports/EscalateDialog'
import { reportUpdateSchema, type ReportUpdateInput } from './schemas'
import type { Go } from './AdminShell'

const KIND_LABEL: Record<TimelineKind, string> = {
  received: 'Received',
  note: 'Internal note',
  status: 'Status',
  reply: 'Customer reply',
  escalation: 'Escalation',
  assign: 'Ownership',
}

export function ReportDetailSheet({ user, report, onClose, go }: { user: StaffUser; report: SuspiciousReport | null; onClose: () => void; go: Go }) {
  const batch = useStore((s) => {
    if (!report) return undefined
    // Reports may carry a vendor alias — resolve to canonical for the link/badge.
    const norm = report.batch.trim().toUpperCase()
    return s.batches.find(
      (b) => b.batch === norm || (b.aliases ?? []).includes(norm) || b.batch.replace(/[^A-Z0-9]/g, '') === norm.replace(/[^A-Z0-9]/g, ''),
    )
  })
  const users = useStore((s) => s.users)
  const [replying, setReplying] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReportUpdateInput>({ resolver: zodResolver(reportUpdateSchema), defaultValues: { status: 'new', note: '' } })

  useEffect(() => {
    if (report) reset({ status: report.status === 'new' ? 'investigating' : report.status, note: '' })
  }, [report?.reference]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!report) return <Sheet open={false} onOpenChange={() => onClose()} title="">{null}</Sheet>

  const mayUpdate = can(user, 'reports.update')
  const assignable = users.filter((u) => u.status === 'active' && u.role !== 'admin')

  const assign = (name: string) => {
    store.updateReport(report.reference, { assignee: name, status: report.status === 'new' ? 'investigating' : report.status }, { by: user.name, kind: 'assign', text: `Assigned to ${name}` })
    store.audit(user.name, 'Assigned report', report.reference, name)
    toast(name === user.name ? 'Assigned to you' : `Assigned to ${name}`)
  }

  const submit = handleSubmit(({ status, note }) => {
    if (status !== report.status) store.updateReport(report.reference, { status, assignee: report.assignee ?? user.name }, { by: user.name, kind: 'status', text: `Status → ${STATUS_LABEL[status]}` })
    if (note) store.updateReport(report.reference, {}, { by: user.name, kind: 'note', text: note })
    store.audit(user.name, status.startsWith('resolved') ? 'Resolved report' : 'Updated report', report.reference, `Status → ${STATUS_LABEL[status]}`)
    reset({ status, note: '' })
    toast('Report updated')
  })

  return (
    <>
      <Sheet
        open
        onOpenChange={(o) => !o && onClose()}
        title={report.reference}
        description={`Received ${format(new Date(report.createdAt), 'd MMM yyyy, HH:mm')} · ${report.assignee ? `Owner: ${report.assignee}` : 'Unassigned'}`}
        footer={
          mayUpdate && (
            <div className="flex flex-wrap gap-2">
              {can(user, 'reports.reply') && (
                <Button onClick={() => setReplying(true)}>
                  <Mail aria-hidden="true" />
                  Reply to customer
                </Button>
              )}
              {report.assignee !== user.name && (
                <Button variant="outline" onClick={() => assign(user.name)}>
                  <UserPlus aria-hidden="true" />
                  Assign to me
                </Button>
              )}
              {can(user, 'reports.escalate') && report.escalation?.state !== 'open' && !report.status.startsWith('resolved') && (
                <Button variant="ghost" onClick={() => setEscalating(true)}>
                  <ArrowUpRight aria-hidden="true" />
                  Escalate to quality
                </Button>
              )}
            </div>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <ReportStatusBadge status={report.status} />
          {report.escalation && (
            <span className="text-sm font-medium text-info">
              Escalation {report.escalation.state === 'open' ? 'open' : report.escalation.state === 'accepted' ? `accepted by ${report.escalation.handledBy}` : 'returned to support'}
            </span>
          )}
        </div>

        <blockquote className="mt-5 border-l-2 border-gold pl-4 text-graphite">{report.message}</blockquote>
        {report.photoName && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-graphite">
            <ImageIcon className="size-4 text-muted" aria-hidden="true" /> Photo attached: {report.photoName}
          </p>
        )}

        <dl className="mt-6 border-t border-gold text-sm">
          {[
            ['Customer', report.fullName],
            ['Email', <a key="e" href={`mailto:${report.email}`} className="text-burgundy underline underline-offset-4">{report.email}</a>],
            ['Phone', report.phone ?? '—'],
            ['Bought from', report.channel],
            [
              'Batch',
              <span key="b" className="flex flex-wrap items-center gap-2">
                {batch ? (
                  <>
                    <button onClick={() => go('batches', { batch: batch.batch })} className="tabular font-semibold text-burgundy underline underline-offset-4">{report.batch}</button>
                    <span className="text-muted">{getProduct(batch.product).name}</span>
                    <BatchStatusBadge b={batch} />
                  </>
                ) : (
                  <>
                    <span className="tabular font-semibold">{report.batch}</span>
                    <span className="font-medium text-error">Never produced — likely counterfeit</span>
                  </>
                )}
              </span>,
            ],
          ].map(([k, v]) => (
            <div key={String(k)} className="grid grid-cols-[7rem_1fr] gap-4 border-b border-mist py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="text-graphite">{v}</dd>
            </div>
          ))}
        </dl>

        {mayUpdate && (
          <div className="mt-6 flex flex-col gap-1.5">
            <label htmlFor="reassign" className="text-sm font-semibold">Owner</label>
            <NativeSelect id="reassign" value={report.assignee ?? ''} onChange={(e) => e.target.value && assign(e.target.value)} className="max-w-xs">
              <option value="">Unassigned</option>
              {assignable.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
            </NativeSelect>
          </div>
        )}

        <h3 className="mt-8 font-semibold text-graphite">Timeline</h3>
        <ol className="mt-2 border-l-2 border-mist pl-5">
          {[...report.timeline].reverse().map((e, i) => (
            <li key={i} className="pb-4">
              <p className="text-xs text-muted">{KIND_LABEL[e.kind]} · {e.by} · {format(new Date(e.at), 'd MMM, HH:mm')}</p>
              <p className="mt-0.5 text-sm text-graphite">{e.text}</p>
            </li>
          ))}
        </ol>
        {report.escalation && (
          <div className="mt-2 rounded-md bg-info-bg p-3 text-sm text-graphite">
            <p className="font-semibold text-info">{report.escalation.urgency === 'urgent' ? 'Urgent escalation' : 'Escalation'} by {report.escalation.by}</p>
            <p className="mt-1">{report.escalation.reason}</p>
          </div>
        )}

        {mayUpdate && (
          <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-4 border-t border-mist pt-6">
            <h3 className="font-semibold text-graphite">Update status or add a note</h3>
            <FormField id="ru-status" label="Status" error={errors.status?.message}>
              {(a) => (
                <NativeSelect {...a} {...register('status')}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </NativeSelect>
              )}
            </FormField>
            <FormField id="ru-note" label="Internal note" optional description="Required when resolving. Never shown to the customer." error={errors.note?.message}>
              {(a) => <Textarea {...a} {...register('note')} className="min-h-24" />}
            </FormField>
            <Button type="submit" variant="outline" className="self-start">Save update</Button>
          </form>
        )}
      </Sheet>
      <ReplyComposer user={user} report={report} batchKnown={!!batch} open={replying} onOpenChange={setReplying} />
      <EscalateDialog user={user} report={report} open={escalating} onOpenChange={setEscalating} />
    </>
  )
}
