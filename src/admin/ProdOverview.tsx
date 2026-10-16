import React, { useEffect, useRef, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Loader2 } from 'lucide-react'
import type { StaffUser } from '../data/admin-seed' // type-only: erased in prod builds
import { adminApi, AuthExpired } from './admin-api'
import type { AdminInsights } from './insights'
import { Findings, Trend, type Finding } from './overview/parts'

/**
 * Production Overview tab (API-backed). Renders ONLY inside ProdShell — like
 * ProdShell itself it never imports lib/store or data fixtures at runtime
 * (those assert at module load in production builds). All numbers come from
 * GET /api/admin/insights (contract: src/admin/insights.ts).
 */
export function ProdOverview({
  user,
  onExpired,
  onGoTab,
}: {
  user: StaffUser
  onExpired: () => void
  onGoTab?: (tab: 'batches' | 'account') => void
}) {
  const [data, setData] = useState<AdminInsights | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Keep the latest callback without re-fetching (parents pass inline arrows).
  const expiredRef = useRef(onExpired)
  expiredRef.current = onExpired

  useEffect(() => {
    let alive = true
    adminApi<AdminInsights>('/api/admin/insights')
      .then((d) => {
        if (alive) setData(d)
      })
      .catch((e) => {
        if (!alive) return
        if (e instanceof AuthExpired) return expiredRef.current()
        setError((e as Error).message)
      })
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return (
      <section aria-label="Overview" className="mt-6">
        <p role="alert" className="rounded-md border-2 border-error bg-error-bg p-3 text-sm text-error">{error}</p>
      </section>
    )
  }
  if (!data) {
    return (
      <section aria-label="Overview" className="mt-6">
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="animate-spin" aria-hidden="true" /> Loading today’s numbers…
        </p>
      </section>
    )
  }

  const target = data.replyTargetHours
  const top = data.hotspots[0]
  const growth = top && top.checksPrev7d > 0 ? Math.round(top.checks7d / top.checksPrev7d) : null
  const owners = data.reports.workload.filter((w) => w.open > 0).length
  const esc = data.escalations

  const findings: Finding[] = []
  if (top) {
    findings.push({
      tone: 'error',
      headline: `Possible counterfeit cluster: ${top.input} checked ${top.checks7d}× this week${growth && growth > 1 ? ` (${growth}× last week)` : ''}`,
      evidence: `Customers are checking a batch number that is not in the registry${top.linkedReports.length ? `; ${top.linkedReports.length} customer report${top.linkedReports.length === 1 ? '' : 's'} trace${top.linkedReports.length === 1 ? 's' : ''} it to ${top.topChannel ?? 'an unlisted seller'}` : ''}. Treat stock carrying this number as suspect and escalate to brand protection.`,
    })
  }
  findings.push({
    tone: data.reports.atRisk > 0 ? 'warning' : 'success',
    headline: data.reports.atRisk > 0
      ? `${data.reports.atRisk} customer ${data.reports.atRisk === 1 ? 'reply is' : 'replies are'} at risk of missing the ${target}-hour target`
      : `Every open report is on track for the ${target}-hour target`,
    evidence: `${data.reports.open} open across ${owners} ${owners === 1 ? 'person' : 'people'}; ${data.reports.unassigned} ${data.reports.unassigned === 1 ? 'has' : 'have'} no owner. ${data.service.repliesOnTargetPct == null ? 'Nothing resolved yet, so there is no reply-time history to score.' : `${data.service.repliesOnTargetPct}% of resolved reports were answered within target.`}`,
    action: onGoTab ? { label: 'Open batches', run: () => onGoTab('batches') } : undefined,
  })
  findings.push({
    tone: 'neutral',
    headline: esc.open > 0
      ? `${esc.open} escalation${esc.open === 1 ? '' : 's'} waiting for a quality decision`
      : data.batches.recalled > 0
        ? `${data.batches.recalled} recall active; no escalations waiting`
        : 'No escalations waiting',
    evidence: [
      esc.oldest ? `Oldest raised ${formatDistanceToNowStrict(new Date(esc.oldest.at))} ago by ${esc.oldest.by}.` : 'Support has nothing blocked on quality.',
      `${data.batches.recalled} of ${data.batches.total} registered batches are recalled; ${data.batches.expiringSoon.length} expire within 120 days.`,
      data.staff.invited.length ? `${data.staff.invited.length} staff invitation${data.staff.invited.length === 1 ? '' : 's'} not yet accepted (${data.staff.invited.map((i) => i.name).join(', ')}).` : 'Every staff invitation has been accepted.',
    ].join(' '),
  })

  const totals = data.lookups14d.days.map((d) => d.checks)
  const notFounds = data.lookups14d.days.map((d) => d.notFound)
  const trendSum = totals.reduce((a, b) => a + b, 0)
  const prev7 = totals.slice(0, 7).reduce((a, b) => a + b, 0)
  const maxLoad = Math.max(1, ...data.reports.workload.map((w) => w.open))


  return (
    <div>
      <section aria-labelledby="po-findings" className="mt-6">
        <h2 id="po-findings" className="sr-only">What needs your attention</h2>
        <Findings items={findings} />
      </section>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="po-trend">
          <h2 id="po-trend" className="text-lg font-semibold text-graphite">Customer checks</h2>
          <div className="mt-3">
            {trendSum > 0 && prev7 > 0 ? (
              <Trend total={totals} highlight={notFounds} label="checks" highlightLabel="not found" />
            ) : (
              <p className="text-graphite">
                <span className="tabular font-serif text-4xl font-semibold text-burgundy">{trendSum.toLocaleString('en-IN')}</span>
                <span className="ml-2 text-sm text-muted">
                  checks, 14 days{trendSum > 0 ? ' · not enough history yet for a week-on-week trend' : ' — the trend appears once customers start verifying packs'}
                </span>
              </p>
            )}
          </div>
        </section>
        <div className="flex flex-col gap-10">
          <section aria-labelledby="po-kpi">
            <h2 id="po-kpi" className="text-lg font-semibold text-graphite">Today at a glance</h2>
            <dl className="mt-3 grid grid-cols-3 gap-4">
              {([
                ['Open', data.reports.open],
                ['At risk (<12 h)', data.reports.atRisk],
                ['Unassigned', data.reports.unassigned],
                ['Escalations', esc.open],
                ['Recalled', data.batches.recalled],
                ['Expiring ≤120 d', data.batches.expiringSoon.length],
              ] as const).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm text-muted">{k}</dt>
                  <dd className="tabular text-2xl font-semibold text-graphite">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="po-load">
            <h2 id="po-load" className="text-lg font-semibold text-graphite">Open reports by owner</h2>
            {data.reports.workload.length === 0 ? (
              <p className="mt-3 text-graphite">No active support or quality staff yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {data.reports.workload.map((w) => (
                  <li key={w.name} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3 text-sm">
                    <span className="truncate text-graphite">{w.name}</span>
                    <span className="h-2 rounded-full bg-mist" aria-hidden="true">
                      <span className="block h-2 rounded-full bg-burgundy" style={{ width: `${(w.open / maxLoad) * 100}%` }} />
                    </span>
                    <span className="tabular text-right font-semibold text-graphite">{w.open}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {data.hotspots.length > 0 && (
        <section aria-labelledby="po-hotspots" className="mt-12">
          <h2 id="po-hotspots" className="font-serif text-2xl font-semibold text-burgundy">Unregistered batch numbers customers are checking</h2>
          <p className="mt-1 text-graphite">Each row is a batch number that was never produced — a strong signal of counterfeit stock in circulation.</p>
          <div role="region" aria-label="Counterfeit hotspots, last 7 days (scrolls sideways on small screens)" tabIndex={0} className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Counterfeit hotspots, last 7 days</caption>
              <thead>
                <tr className="border-b border-gold text-muted">
                  <th scope="col" className="py-2.5 pr-4 font-medium">Batch number</th>
                  <th scope="col" className="py-2.5 pr-4 text-right font-medium">Checks, 7 d</th>
                  <th scope="col" className="py-2.5 pr-4 text-right font-medium">vs prior 7 d</th>
                  <th scope="col" className="py-2.5 font-medium">Where bought</th>
                  <th scope="col" className="py-2.5 text-right font-medium">Reports</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {data.hotspots.map((h) => (
                  <tr key={h.input} className="border-b border-mist">
                    <th scope="row" className="py-2.5 pr-4 font-semibold text-burgundy">{h.input}</th>
                    <td className="py-2.5 pr-4 text-right text-graphite">{h.checks7d}</td>
                    <td className={`py-2.5 pr-4 text-right font-semibold ${h.checksPrev7d > 0 && h.checks7d > h.checksPrev7d * 2 ? 'text-error' : 'text-graphite'}`}>
                      {h.checksPrev7d === 0 ? 'new' : `${Math.round(h.checks7d / h.checksPrev7d)}×`}
                    </td>
                    <td className="py-2.5 text-graphite">{h.topChannel ?? '—'}</td>
                    <td className="py-2.5 text-right text-graphite">{h.linkedReports.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
