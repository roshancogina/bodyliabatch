import React from 'react'
import { PageHeader } from '../PageHeader'
import type { AdminInsights } from '../insights'
import { ProdError, ProdLoading, useAdminQuery } from './shared'

/**
 * Production Intelligence tab (API-backed). Reuses the same
 * GET /api/admin/insights payload as the Overview, but frames it as
 * counterfeit exposure: hotspots, channel suspicion and lookup trends.
 */

export function ProdIntelligencePage({ onSignOut }: { onSignOut: () => void }) {
  const { data, error, loading } = useAdminQuery<AdminInsights>('/api/admin/insights', onSignOut)

  if (error || loading || !data) {
    return (
      <div className="mt-6">
        <PageHeader title="Intelligence" description="Counterfeit exposure and lookup trends." />
        <div className="mt-6">{error ? <ProdError message={error} /> : <ProdLoading label="Loading intelligence…" />}</div>
      </div>
    )
  }

  const lookups = data.lookups14d
  const nfPct = lookups.total > 0 ? Math.round((lookups.notFound / lookups.total) * 100) : 0
  const suspected = data.reports.byChannel.reduce((sum, c) => sum + c.suspected, 0)

  return (
    <div className="mt-6">
      <PageHeader
        title="Intelligence"
        description="Counterfeit exposure and lookup trends — where customers are checking numbers that were never registered."
      />

      <dl className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {[
          ['Lookups, 14 days', String(lookups.total)],
          ['Not found', `${lookups.notFound} (${nfPct}%)`],
          ['Hotspots', String(data.hotspots.length)],
          ['Suspected reports', String(suspected)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="tabular text-2xl font-semibold text-graphite">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="intel-hotspots" className="mt-12">
        <h2 id="intel-hotspots" className="font-serif text-2xl font-semibold text-burgundy">
          Unregistered batch numbers customers are checking
        </h2>
        <p className="mt-1 text-graphite">
          Each row is a batch number that was never produced — a strong signal of counterfeit stock in circulation.
        </p>
        {data.hotspots.length === 0 ? (
          <p className="mt-4 text-graphite">No hotspots in the last 7 days — nothing to chase.</p>
        ) : (
          <div
            role="region"
            aria-label="Counterfeit hotspots, last 7 days (scrolls sideways on small screens)"
            tabIndex={0}
            className="mt-4 overflow-x-auto"
          >
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
                    <td
                      className={`py-2.5 pr-4 text-right font-semibold ${
                        h.checksPrev7d > 0 && h.checks7d > h.checksPrev7d * 2 ? 'text-error' : 'text-graphite'
                      }`}
                    >
                      {h.checksPrev7d === 0 ? 'new' : `${Math.round(h.checks7d / h.checksPrev7d)}×`}
                    </td>
                    <td className="py-2.5 text-graphite">{h.topChannel ?? '—'}</td>
                    <td className="py-2.5 text-right text-graphite">{h.linkedReports.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="intel-channels" className="mt-12">
        <h2 id="intel-channels" className="text-lg font-semibold text-graphite">
          Reports by where they were bought
        </h2>
        <div role="region" aria-label="Reports by channel (scrolls sideways)" tabIndex={0} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="sr-only">Reports by channel with suspected counterfeits</caption>
            <thead>
              <tr className="border-b border-gold text-muted">
                <th scope="col" className="py-2.5 pr-4 font-medium">Channel</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium">Reports</th>
                <th scope="col" className="py-2.5 text-right font-medium">Suspected counterfeit</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.reports.byChannel.map((c) => (
                <tr key={c.channel} className="border-b border-mist">
                  <th scope="row" className="py-2.5 pr-4 font-semibold text-graphite">{c.channel}</th>
                  <td className="py-2.5 pr-4 text-right text-graphite">{c.total}</td>
                  <td className={`py-2.5 text-right font-semibold ${c.suspected > 0 ? 'text-error' : 'text-graphite'}`}>
                    {c.suspected}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="intel-trend" className="mt-12">
        <h2 id="intel-trend" className="text-lg font-semibold text-graphite">
          Public lookups, last 14 days
        </h2>
        <div role="region" aria-label="Daily lookups (scrolls sideways)" tabIndex={0} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">Daily public lookups and not-found share</caption>
            <thead>
              <tr className="border-b border-gold text-muted">
                <th scope="col" className="py-2.5 pr-4 font-medium">Day (UTC)</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium">Checks</th>
                <th scope="col" className="py-2.5 text-right font-medium">Not found</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.lookups14d.days.map((d) => (
                <tr key={d.day} className="border-b border-mist">
                  <th scope="row" className="py-2.5 pr-4 font-semibold text-graphite">{d.day}</th>
                  <td className="py-2.5 pr-4 text-right text-graphite">{d.checks}</td>
                  <td className={`py-2.5 text-right font-semibold ${d.notFound > 0 ? 'text-burgundy' : 'text-graphite'}`}>
                    {d.notFound}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

