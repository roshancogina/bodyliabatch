import React from 'react'
import { differenceInDays, formatDistanceToNowStrict } from 'date-fns'
import { HOTSPOTS, LOOKUPS_14D, NOT_FOUND_14D, type StaffUser } from '../../data/admin-seed'
import { useStore } from '../../lib/store'
import { getProduct } from '../../lib/products'
import { PageHeader } from '../PageHeader'
import type { Go } from '../AdminShell'
import { Findings, Trend, type Finding } from './parts'

export function QualityOverview({ user, go }: { user: StaffUser; go: Go }) {
  const reports = useStore((s) => s.reports)
  const batches = useStore((s) => s.batches)
  const labs = useStore((s) => s.labs)
  const openEsc = reports.filter((r) => r.escalation?.state === 'open')
  const expiring = batches.filter((b) => {
    const d = differenceInDays(new Date(b.expires), new Date())
    return b.status === 'released' && d >= 0 && d <= 120
  })
  const top = HOTSPOTS[0]
  const growth = Math.round(top.checks7d / Math.max(top.checksPrev7d, 1))
  const labSoon = labs.find((l) => l.accreditationExpires && differenceInDays(new Date(l.accreditationExpires), new Date()) < 240)

  const findings: Finding[] = [
    {
      tone: 'error',
      headline: `Likely counterfeit cluster: ${top.batch} checked ${top.checks7d} times this week (${growth}× last week)`,
      evidence: `This ${top.product} batch number was never produced. ${top.linkedReports.length} customer reports trace it to ${top.topChannel}, mostly from ${top.topCity}. Recommend a takedown request to the marketplace today.`,
      action: { label: 'Open intelligence', run: () => go('intelligence') },
    },
    {
      tone: openEsc.length ? 'warning' : 'success',
      headline: openEsc.length ? `${openEsc.length} escalation${openEsc.length > 1 ? 's' : ''} waiting for a quality decision` : 'No escalations waiting',
      evidence: openEsc.length
        ? `Oldest raised ${formatDistanceToNowStrict(new Date(openEsc[0].escalation!.at))} ago by ${openEsc[0].escalation!.by}. Support can’t reply to the customer until you accept or return it.`
        : 'Support has nothing blocked on quality.',
      action: openEsc.length ? { label: 'Review escalations', run: () => go('escalations') } : undefined,
    },
    {
      tone: 'neutral',
      headline: labSoon ? `${labSoon.name.split(',')[0]} accreditation expires ${formatDistanceToNowStrict(new Date(labSoon.accreditationExpires!), { addSuffix: true })}` : `${expiring.length} batches expire within 120 days`,
      evidence: labSoon
        ? `Batches tested after expiry can’t be released. Ask the administrator to confirm renewal with ${labSoon.accreditation}.`
        : 'Plan sell-through or write-off with the commercial team.',
    },
  ]

  return (
    <div>
      <PageHeader title={`Good to see you, ${user.name.split(' ')[0]}`} description="Quality overview — counterfeit risk, escalations and batch health." />
      <div className="mt-6">
        <Findings items={findings} />
      </div>
      <div className="mt-12 grid gap-12 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="trend-title">
          <h2 id="trend-title" className="text-lg font-semibold text-graphite">Public checks</h2>
          <div className="mt-3"><Trend total={LOOKUPS_14D} highlight={NOT_FOUND_14D} label="checks" highlightLabel="not found" /></div>
        </section>
        <section aria-labelledby="health-title">
          <h2 id="health-title" className="text-lg font-semibold text-graphite">Batch health</h2>
          <dl className="mt-3 grid grid-cols-3 gap-4">
            {[
              ['Registered', batches.length],
              ['Recalled', batches.filter((b) => b.status === 'recalled').length],
              ['Expiring ≤120 d', expiring.length],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-muted">{k}</dt>
                <dd className="tabular text-2xl font-semibold text-graphite">{v}</dd>
              </div>
            ))}
          </dl>
          {expiring.length > 0 && (
            <ul className="mt-4 text-sm text-graphite">
              {expiring.map((b) => (
                <li key={b.batch}>
                  <button onClick={() => go('batches', { batch: b.batch })} className="inline-flex min-h-11 items-center text-burgundy underline underline-offset-4">
                    {getProduct(b.product).name} {b.batch}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
