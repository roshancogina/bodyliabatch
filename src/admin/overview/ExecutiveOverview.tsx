import React from 'react'
import { HOTSPOTS, LOOKUPS_14D, NOT_FOUND_14D, SERVICE_HEALTH, type StaffUser } from '../../data/admin-seed'
import { useStore } from '../../lib/store'
import { PageHeader } from '../PageHeader'
import type { Go } from '../AdminShell'
import { Findings, Trend, hoursLeft, type Finding } from './parts'

export function ExecutiveOverview({ user, go }: { user: StaffUser; go: Go }) {
  const reports = useStore((s) => s.reports)
  const users = useStore((s) => s.users)
  const batches = useStore((s) => s.batches)
  const target = useStore((s) => s.settings.replyTargetHours)
  const open = reports.filter((r) => r.status === 'new' || r.status === 'investigating')
  const atRisk = open.filter((r) => hoursLeft(r, target) < 12)
  const counterfeit = reports.filter((r) => r.status === 'resolved_counterfeit').length
  const resolved = reports.filter((r) => r.status.startsWith('resolved')).length
  const recalled = batches.filter((b) => b.status === 'recalled')
  const top = HOTSPOTS[0]
  const invited = users.filter((u) => u.status === 'invited')

  const findings: Finding[] = [
    {
      tone: 'error',
      headline: `Counterfeit exposure is concentrated in one marketplace seller`,
      evidence: `${top.topChannel} accounts for ${top.linkedReports.length} of ${open.length} open reports and a ${Math.round(top.checks7d / top.checksPrev7d)}× week-on-week spike in checks on an unproduced ${top.product} batch. ${counterfeit} of ${resolved} resolved reports were confirmed counterfeit. Recommend legal escalate a brand-protection takedown.`,
      action: { label: 'See the evidence', run: () => go('intelligence') },
    },
    {
      tone: atRisk.length ? 'warning' : 'success',
      headline: atRisk.length ? `${atRisk.length} customer ${atRisk.length === 1 ? 'reply is' : 'replies are'} at risk of missing the ${target}-hour target` : `Every open report is on track for the ${target}-hour target`,
      evidence: `${SERVICE_HEALTH.within48h}% of reports were answered within target over the last 30 days. ${open.length} are open across ${new Set(open.map((r) => r.assignee).filter(Boolean)).size} people; ${open.filter((r) => !r.assignee).length} have no owner.`,
      action: { label: 'Open reports', run: () => go('reports') },
    },
    {
      tone: 'neutral',
      headline: recalled.length ? `${recalled.length} recall active; public page and verdicts are live` : 'No active recalls',
      evidence: `${invited.length} staff invitation${invited.length === 1 ? '' : 's'} not yet accepted${invited.length ? ` (${invited.map((u) => u.name).join(', ')})` : ''}. Service uptime ${SERVICE_HEALTH.uptime30d}% over 30 days.`,
      action: invited.length ? { label: 'Manage staff', run: () => go('users') } : undefined,
    },
  ]

  const workload = users
    .filter((u) => u.status === 'active' && u.role !== 'admin')
    .map((u) => ({ name: u.name, open: open.filter((r) => r.assignee === u.name).length }))
    .sort((a, b) => b.open - a.open)
  const maxLoad = Math.max(1, ...workload.map((w) => w.open))

  return (
    <div>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]}`} description="Executive overview — the three things that matter today, then the numbers behind them." />
      <div className="mt-6">
        <Findings items={findings} />
      </div>
      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="ex-trend">
          <h2 id="ex-trend" className="text-lg font-semibold text-graphite">Customer checks</h2>
          <div className="mt-3"><Trend total={LOOKUPS_14D} highlight={NOT_FOUND_14D} label="checks" highlightLabel="not found" /></div>
        </section>
        <div className="flex flex-col gap-10">
          <section aria-labelledby="ex-health">
            <h2 id="ex-health" className="text-lg font-semibold text-graphite">Service health, 30 days</h2>
            <dl className="mt-3 grid grid-cols-3 gap-4">
              {[
                ['Uptime', `${SERVICE_HEALTH.uptime30d}%`, 'target 99.9%'],
                ['p95 check time', `${SERVICE_HEALTH.p95LookupMs} ms`, 'target < 250 ms'],
                ['Replies on time', `${SERVICE_HEALTH.within48h}%`, 'target 95%'],
              ].map(([k, v, t]) => (
                <div key={k}>
                  <dt className="text-sm text-muted">{k}</dt>
                  <dd className="tabular text-2xl font-semibold text-graphite">{v}</dd>
                  <dd className="text-xs text-muted">{t}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="ex-load">
            <h2 id="ex-load" className="text-lg font-semibold text-graphite">Open reports by owner</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {workload.map((w) => (
                <li key={w.name} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3 text-sm">
                  <span className="truncate text-graphite">{w.name}</span>
                  <span className="h-2 rounded-full bg-mist" aria-hidden="true">
                    <span className="block h-2 rounded-full bg-burgundy" style={{ width: `${(w.open / maxLoad) * 100}%` }} />
                  </span>
                  <span className="tabular text-right font-semibold text-graphite">{w.open}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
