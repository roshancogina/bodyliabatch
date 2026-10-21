import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Search } from 'lucide-react'
import { adminApi } from '../admin-api'
import { toast } from '../../lib/toast'
import { PageHeader } from '../PageHeader'
import { Button } from '../../components/ui/button'
import { Input, NativeSelect, Textarea } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { escalateSchema, reportUpdateSchema, type EscalateInput, type ReportUpdateInput } from '../schemas'
import { ProdError, ProdLoading, ProdStatusBadge, useAdminQuery, useProdActions, whenLabel } from './shared'

/**
 * Production Reports tab (API-backed). GET /api/admin/reports (status + text
 * search), detail via GET /api/admin/reports/:ref, mutations via
 * PATCH :ref (status / note / assignee) and POST :ref/escalate — all audited
 * server-side and pinned by backend-go/admin_cms_test.go.
 */

interface ReportSummary {
  reference: string
  fullName: string
  email: string
  batch: string
  channel: string
  orderNumber?: string
  purchaseDate?: string
  batchVerified?: boolean
  message: string
  status: string
  assignee?: string
  createdAt: string
}

interface TimelineEvent {
  at: string
  by: string
  kind: string
  text: string
}

interface ReportDetail extends ReportSummary {
  phone?: string
  photoName?: string
  timeline: TimelineEvent[]
}

const STATUS_FILTERS = [
  { value: 'open', label: 'Open (new + investigating)' },
  { value: 'all', label: 'All reports' },
  { value: 'new', label: 'New' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved_genuine', label: 'Resolved — genuine' },
  { value: 'resolved_counterfeit', label: 'Resolved — counterfeit' },
]

export function ProdReportsPage({ onSignOut }: { onSignOut: () => void }) {
  const [status, setStatus] = useState('open')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const { busy, run } = useProdActions(onSignOut)

  const list = useAdminQuery<ReportSummary[]>(
    `/api/admin/reports?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`,
    onSignOut,
  )
  const detail = useAdminQuery<ReportDetail>(
    selected ? `/api/admin/reports/${encodeURIComponent(selected)}` : null,
    onSignOut,
  )

  const refresh = () => {
    list.reload()
    if (selected) detail.reload()
  }

  const assign = async (reference: string, assignee: string) => {
    const ok = await run(`assign:${reference}`, async () => {
      await adminApi(`/api/admin/reports/${encodeURIComponent(reference)}`, {
        method: 'PATCH',
        body: { assignee },
      })
    })
    if (ok) {
      toast(assignee ? `Assigned to ${assignee}` : 'Assignee removed')
      refresh()
    }
  }

  return (
    <div className="mt-6">
      <PageHeader
        title="Customer reports"
        description="Every report filed on batch.bodylia.in — assign, note, resolve and escalate from here."
      />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <form
          className="flex flex-1 items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            setQ(search.trim())
          }}
        >
          <FormField id="rep-search" label="Search reports" className="flex-1">
            {(a) => (
              <Input
                {...a}
                type="search"
                placeholder="Reference, customer, email or batch…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
          </FormField>
          <Button type="submit" variant="outline" className="shrink-0">
            <Search className="mr-1.5 size-4" aria-hidden="true" /> Search
          </Button>
        </form>
        <FormField id="rep-status" label="Status" className="sm:w-64">
          {(a) => (
            <NativeSelect {...a} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>

      {list.error && (
        <div className="mt-4">
          <ProdError message={list.error} />
        </div>
      )}
      {list.loading && (
        <div className="mt-4">
          <ProdLoading label="Loading reports…" />
        </div>
      )}

      {detail.error && (
        <div className="mt-4">
          <ProdError message={detail.error} />
        </div>
      )}
      {detail.data && (
        <ReportDetailPanel
          report={detail.data}
          busy={busy}
          run={run}
          onChanged={refresh}
          onBack={() => setSelected(null)}
          onAssign={(assignee) => assign(detail.data!.reference, assignee)}
        />
      )}

      {list.data && !list.loading && (
        <div
          role="region"
          aria-label="Reports (scrolls sideways on small screens)"
          tabIndex={0}
          className="mt-6 overflow-x-auto"
        >
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Customer reports</caption>
            <thead>
              <tr className="border-b border-gold text-muted">
                <th scope="col" className="py-2.5 pr-4 font-medium">Reference</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Customer</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Batch</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Channel</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Status</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Owner</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Filed</th>
                <th scope="col" className="py-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.reference} className="border-b border-mist">
                  <th scope="row" className="tabular py-2.5 pr-4 font-semibold text-graphite">{r.reference}</th>
                  <td className="py-2.5 pr-4 text-graphite">{r.fullName}</td>
                  <td className="tabular py-2.5 pr-4 text-graphite">{r.batch || '—'}</td>
                  <td className="py-2.5 pr-4 text-graphite">{r.channel}</td>
                  <td className="py-2.5 pr-4"><ProdStatusBadge status={r.status} /></td>
                  <td className="py-2.5 pr-4 text-graphite">
                    {r.assignee ?? <span className="text-muted">Unassigned</span>}
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-graphite">{whenLabel(r.createdAt)}</td>
                  <td className="py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelected(r.reference)}
                      aria-label={`Open report ${r.reference}`}
                    >
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data.length === 0 && <p className="mt-4 text-graphite">No reports match this filter.</p>}
        </div>
      )}
    </div>
  )
}


/** Detail panel: customer message + timeline, with status/note/assignee and escalate. */
function ReportDetailPanel({
  report,
  busy,
  run,
  onChanged,
  onBack,
  onAssign,
}: {
  report: ReportDetail
  busy: string | null
  run: (key: string, fn: () => Promise<void>) => Promise<boolean>
  onChanged: () => void
  onBack: () => void
  onAssign: (assignee: string) => void
}) {
  const update = useForm<ReportUpdateInput>({
    resolver: zodResolver(reportUpdateSchema),
    defaultValues: { status: report.status as ReportUpdateInput['status'], note: '' },
  })
  const escalate = useForm<EscalateInput>({
    resolver: zodResolver(escalateSchema),
    defaultValues: { urgency: 'standard', reason: '' },
  })
  const [assigneeText, setAssigneeText] = useState(report.assignee ?? '')
  // Re-sync the forms when a different report opens (or after a reload).
  useEffect(() => {
    update.reset({ status: report.status as ReportUpdateInput['status'], note: '' })
    escalate.reset({ urgency: 'standard', reason: '' })
    setAssigneeText(report.assignee ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.reference])

  const submitUpdate = update.handleSubmit(async (v) => {
    const ok = await run(`update:${report.reference}`, async () => {
      await adminApi(`/api/admin/reports/${encodeURIComponent(report.reference)}`, {
        method: 'PATCH',
        body: { status: v.status, note: v.note.trim() },
      })
    })
    if (ok) {
      toast('Report updated')
      update.reset({ status: v.status, note: '' })
      onChanged()
    }
  })

  const submitEscalate = escalate.handleSubmit(async (v) => {
    const ok = await run(`escalate:${report.reference}`, async () => {
      await adminApi(`/api/admin/reports/${encodeURIComponent(report.reference)}/escalate`, {
        method: 'POST',
        body: { urgency: v.urgency, reason: v.reason },
      })
    })
    if (ok) {
      toast('Escalated to quality', { tone: 'info' })
      escalate.reset({ urgency: 'standard', reason: '' })
      onChanged()
    }
  })

  const noteValue = update.watch('note') ?? ''
  const statusValue = update.watch('status')
  const resolving = statusValue.startsWith('resolved')
  return (
    <section aria-label={`Report ${report.reference}`} className="mt-8 border-2 border-mist rounded-lg p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="tabular font-serif text-2xl font-semibold text-graphite">{report.reference}</h2>
            <ProdStatusBadge status={report.status} />
          </div>
          <p className="mt-1 text-sm text-graphite">
            {report.fullName} · {report.email}
            {report.phone ? ` · ${report.phone}` : ''} · via {report.channel} · filed {whenLabel(report.createdAt)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="tabular">Batch: <strong className="text-graphite">{report.batch || '—'}</strong></span>
            {report.batchVerified && <span className="text-emerald-700 font-medium">✓ Verified genuine batch</span>}
            {report.orderNumber && <span>Order #: <strong className="text-graphite">{report.orderNumber}</strong></span>}
            {report.purchaseDate && <span>Purchased: <strong className="text-graphite">{report.purchaseDate}</strong></span>}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          Close detail
        </Button>
      </div>

      <blockquote className="mt-4 rounded-md bg-sand p-4 text-sm text-graphite">
        “{report.message}”
        {report.photoName && <footer className="mt-2 text-xs text-muted">Photo attached: {report.photoName}</footer>}
      </blockquote>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <form onSubmit={submitUpdate} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-graphite">Update status</h3>
          <FormField
            id={`upd-status-${report.reference}`}
            label="Status"
            error={update.formState.errors.status?.message}
          >
            {(a) => (
              <NativeSelect {...a} {...update.register('status')}>
                {STATUS_FILTERS.filter((f) => f.value !== 'all' && f.value !== 'open').map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            id={`upd-note-${report.reference}`}
            label="Note"
            optional={!resolving}
            description={
              resolving
                ? 'Resolution notes are at least 10 characters and go on the record.'
                : 'Internal note — becomes a timeline event.'
            }
            error={update.formState.errors.note?.message}
          >
            {(a) => <Textarea {...a} rows={3} {...update.register('note')} maxLength={1000} />}
          </FormField>
          <Button type="submit" className="self-start" disabled={update.formState.isSubmitting || busy === `update:${report.reference}`}>
            {busy === `update:${report.reference}` ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Save changes
          </Button>
        </form>

        <div className="flex flex-col gap-5">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              onAssign(assigneeText.trim())
            }}
          >
            <h3 className="text-base font-semibold text-graphite">Owner</h3>
            <FormField id={`assign-${report.reference}`} label="Assignee" optional description="Leave empty to unassign.">
              {(a) => (
                <Input
                  {...a}
                  value={assigneeText}
                  onChange={(e) => setAssigneeText(e.target.value)}
                  placeholder="Staff member’s name"
                  maxLength={80}
                />
              )}
            </FormField>
            <Button type="submit" variant="outline" className="self-start">
              Save owner
            </Button>
          </form>

          <form onSubmit={submitEscalate} className="flex flex-col gap-3">
            <h3 className="text-base font-semibold text-burgundy">Escalate to quality</h3>
            <FormField id={`esc-urgency-${report.reference}`} label="Urgency" error={escalate.formState.errors.urgency?.message}>
              {(a) => (
                <NativeSelect {...a} {...escalate.register('urgency')}>
                  <option value="standard">Standard</option>
                  <option value="urgent">Urgent — possible public safety issue</option>
                </NativeSelect>
              )}
            </FormField>
            <FormField
              id={`esc-reason-${report.reference}`}
              label="What did you find?"
              error={escalate.formState.errors.reason?.message}
              description="At least 20 characters — quality acts on this text."
            >
              {(a) => <Textarea {...a} rows={3} {...escalate.register('reason')} maxLength={600} />}
            </FormField>
            <Button type="submit" variant="outline" className="self-start" disabled={busy === `escalate:${report.reference}`}>
              {busy === `escalate:${report.reference}` ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Escalate
            </Button>
          </form>
        </div>
      </div>

      <section aria-label="Timeline" className="mt-6 border-t border-mist pt-4">
        <h3 className="text-base font-semibold text-graphite">Timeline</h3>
        <ol className="mt-3 flex flex-col gap-2.5">
          {report.timeline.map((t, i) => (
            <li key={`${t.at}-${i}`} className="grid grid-cols-[auto_1fr] gap-3 text-sm">
              <span className="whitespace-nowrap text-muted">{whenLabel(t.at)}</span>
              <span className="text-graphite">
                <span className="font-semibold">{t.by}</span>
                <span className="ml-2 rounded-full bg-mist px-2 py-0.5 text-xs font-medium text-graphite">{t.kind}</span>
                <span className="ml-2">{t.text}</span>
              </span>
            </li>
          ))}
          {report.timeline.length === 0 && <li className="text-graphite">No activity recorded yet.</li>}
        </ol>
      </section>
    </section>
  )
}

