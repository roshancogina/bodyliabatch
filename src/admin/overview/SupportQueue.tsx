import React from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowRight, UserPlus } from 'lucide-react'
import type { StaffUser } from '../../data/admin-seed'
import { store, useStore } from '../../lib/store'
import { toast } from '../../lib/toast'
import { Button } from '../../components/ui/button'
import { ReportStatusBadge } from '../ReportStatusBadge'
import { PageHeader } from '../PageHeader'
import type { Go } from '../AdminShell'
import { DueLabel, hoursLeft } from './parts'

export function SupportQueue({ user, go }: { user: StaffUser; go: Go }) {
  const reports = useStore((s) => s.reports)
  const target = useStore((s) => s.settings.replyTargetHours)
  const mine = reports
    .filter((r) => r.assignee === user.name && (r.status === 'new' || r.status === 'investigating'))
    .sort((a, b) => hoursLeft(a, target) - hoursLeft(b, target))
  const unassigned = reports.filter((r) => !r.assignee && r.status === 'new')
  const dueToday = mine.filter((r) => hoursLeft(r, target) < 24).length
  const resolvedThisWeek = reports.filter(
    (r) => r.assignee === user.name && r.status.startsWith('resolved') && Date.now() - new Date(r.createdAt).getTime() < 7 * 86_400_000,
  ).length

  const assignToMe = (ref: string) => {
    store.updateReport(ref, { assignee: user.name, status: 'investigating' }, { by: user.name, kind: 'assign', text: `Assigned to ${user.name}` })
    store.audit(user.name, 'Assigned report', ref, 'Self-assigned')
    toast(`${ref} is now yours`, { description: 'Moved to your queue.' })
  }

  return (
    <div>
      <PageHeader
        title={mine.length === 0 ? 'Your queue is clear' : `${mine.length} ${mine.length === 1 ? 'report' : 'reports'} in your queue`}
        description={
          mine.length === 0
            ? `Pick up an unassigned report below. You resolved ${resolvedThisWeek} this week.`
            : `${dueToday} due within 24 hours. Reply target: ${target} hours from receipt. You resolved ${resolvedThisWeek} this week.`
        }
      />

      <div className="mt-8 grid gap-12 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="mine-title">
          <h2 id="mine-title" className="font-serif text-2xl font-semibold text-burgundy">Assigned to you, most urgent first</h2>
          {mine.length === 0 ? (
            <p className="mt-4 rounded-md bg-sand p-5 text-graphite">Nothing assigned. Take the oldest unassigned report so no customer waits past target.</p>
          ) : (
            <ul className="mt-3 divide-y divide-mist border-y border-mist">
              {mine.map((r) => (
                <li key={r.reference}>
                  <button onClick={() => go('reports', { report: r.reference })} className="grid w-full gap-1 py-4 text-left transition-colors duration-150 hover:bg-sand sm:px-3">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="tabular font-semibold text-burgundy underline decoration-1 underline-offset-4">{r.reference}</span>
                      <span className="text-sm"><DueLabel hours={hoursLeft(r, target)} /></span>
                    </span>
                    <span className="tabular text-sm text-muted">{r.batch} · {r.channel} · {r.fullName}</span>
                    <span className="line-clamp-2 text-graphite">{r.message}</span>
                    {r.escalation?.state === 'open' && <span className="text-sm font-medium text-info">Escalated to quality — awaiting their findings</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="un-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="un-title" className="text-lg font-semibold text-graphite">Unassigned ({unassigned.length})</h2>
            <button onClick={() => go('reports')} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-burgundy underline underline-offset-4">
              All reports <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          {unassigned.length === 0 ? (
            <p className="mt-2 text-graphite">None — every new report has an owner.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-3">
              {unassigned.map((r) => (
                <li key={r.reference} className="rounded-md bg-white p-4 ring-1 ring-mist">
                  <div className="flex items-center justify-between gap-2">
                    <span className="tabular font-semibold text-graphite">{r.reference}</span>
                    <ReportStatusBadge status={r.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-graphite">{r.message}</p>
                  <p className="mt-1 text-xs text-muted">Received {formatDistanceToNowStrict(new Date(r.createdAt))} ago · <DueLabel hours={hoursLeft(r, target)} /></p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => assignToMe(r.reference)}>
                    <UserPlus aria-hidden="true" />
                    Assign to me<span className="sr-only"> {r.reference}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
