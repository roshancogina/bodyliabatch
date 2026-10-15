import React from 'react'
import { Download } from 'lucide-react'
import { HOTSPOTS, NOT_FOUND_BY_PRODUCT } from '../data/admin-seed'
import { useStore } from '../lib/store'
import { downloadCsv } from '../lib/pdf'
import { toast } from '../lib/toast'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { PageHeader } from './PageHeader'
import type { Go } from './AdminShell'

export function IntelligencePage({ go }: { go: Go }) {
  const reports = useStore((s) => s.reports)
  const feedback = useStore((s) => s.feedback)
  const batches = useStore((s) => s.batches)
  const reportsKnown = (batch: string) => batches.some((b) => b.batch === batch)
  const top = HOTSPOTS[0]

  const byChannel = Object.entries(
    reports.reduce<Record<string, { total: number; counterfeit: number }>>((acc, r) => {
      const c = (acc[r.channel] ??= { total: 0, counterfeit: 0 })
      c.total += 1
      if (r.status === 'resolved_counterfeit' || !reportsKnown(r.batch)) c.counterfeit += 1
      return acc
    }, {}),
  ).sort((a, b) => b[1].counterfeit - a[1].counterfeit)
  const maxWeek = Math.max(...NOT_FOUND_BY_PRODUCT.flatMap((p) => p.weeks))
  const helpful = feedback.filter((f) => f.helpful).length

  const exportHotspots = () => {
    downloadCsv('bodylia-counterfeit-hotspots.csv', [
      ['batch', 'product', 'checks_7d', 'checks_prev_7d', 'top_channel', 'top_city', 'linked_reports'],
      ...HOTSPOTS.map((h) => [h.batch, h.product, h.checks7d, h.checksPrev7d, h.topChannel, h.topCity, h.linkedReports.join(' ')]),
    ])
    toast('Hotspots exported', { description: 'Ready to share with brand protection or legal.' })
  }

  return (
    <div>
      <PageHeader
        title={`${top.product} counterfeits are surfacing through one Flipkart seller`}
        description={`Not-found checks on unproduced batch ${top.batch} rose from ${top.checksPrev7d} to ${top.checks7d} in a week, concentrated in ${top.topCity}. Two customer reports name the same seller. Recommendation: file a marketplace takedown and add a warning to the FertiliNova product page.`}
        actions={
          <Button variant="outline" onClick={exportHotspots}>
            <Download aria-hidden="true" />
            Export evidence (CSV)
          </Button>
        }
      />

      <section aria-labelledby="hs-title" className="mt-8">
        <h2 id="hs-title" className="font-serif text-2xl font-semibold text-burgundy">Unregistered batch numbers customers are checking</h2>
        <p className="mt-1 text-graphite">Each row is a batch number that was never produced — a strong signal of counterfeit stock in circulation.</p>
        <div role="region" aria-label="Counterfeit hotspots, last 7 days (scrolls sideways on small screens)" tabIndex={0} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Counterfeit hotspots, last 7 days</caption>
            <thead>
              <tr className="border-b border-gold text-muted">
                <th scope="col" className="py-2.5 pr-4 font-medium">Batch number</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium">Checks, 7 d</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium">vs prior 7 d</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Where bought</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Top city</th>
                <th scope="col" className="py-2.5 font-medium">Reports</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {HOTSPOTS.map((h) => {
                const change = Math.round(((h.checks7d - h.checksPrev7d) / Math.max(h.checksPrev7d, 1)) * 100)
                return (
                  <tr key={h.batch} className="border-b border-mist align-top">
                    <th scope="row" className="py-3 pr-4 font-semibold text-graphite">
                      {h.batch}
                      <span className="block font-normal text-muted">{h.product}</span>
                    </th>
                    <td className="py-3 pr-4 text-right text-lg font-semibold text-graphite">{h.checks7d}</td>
                    <td className={cn('py-3 pr-4 text-right font-semibold', change > 100 ? 'text-error' : change < 0 ? 'text-success' : 'text-graphite')}>
                      {change > 0 ? '+' : ''}{change}%
                    </td>
                    <td className="py-3 pr-4 text-graphite">{h.topChannel}</td>
                    <td className="py-3 pr-4 text-graphite">{h.topCity}</td>
                    <td className="py-3">
                      {h.linkedReports.length === 0 ? (
                        <span className="text-muted">None yet</span>
                      ) : (
                        <ul>
                          {h.linkedReports.map((r) => (
                            <li key={r}>
                              <button onClick={() => go('reports', { report: r })} className="inline-flex min-h-11 items-center text-burgundy underline underline-offset-4">{r}</button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-14 grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="prod-title">
          <h2 id="prod-title" className="text-lg font-semibold text-graphite">Not-found checks by product, last 4 weeks</h2>
          <p className="mt-1 text-sm text-muted">MaternaBloom is falling after last month’s takedown; FertiliNova is the new risk.</p>
          <table className="mt-4 w-full text-left text-sm">
            <caption className="sr-only">Weekly not-found checks per product, oldest week first</caption>
            <thead>
              <tr className="border-b border-gold text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Product</th>
                {['W-3', 'W-2', 'W-1', 'This week'].map((w) => <th key={w} scope="col" className="py-2 pr-3 text-right font-medium">{w}</th>)}
              </tr>
            </thead>
            <tbody className="tabular">
              {NOT_FOUND_BY_PRODUCT.map((p) => (
                <tr key={p.product} className="border-b border-mist">
                  <th scope="row" className="py-2 pr-3 font-medium text-graphite">{p.product}</th>
                  {p.weeks.map((w, i) => (
                    <td key={i} className="py-2 pr-3 text-right">
                      <span className="inline-flex items-center justify-end gap-2">
                        <span aria-hidden="true" className="inline-block h-2 rounded-full bg-burgundy" style={{ width: `${Math.max(2, (w / maxWeek) * 48)}px` }} />
                        <span className={cn(i === 3 && w > p.weeks[2] * 2 ? 'font-semibold text-error' : 'text-graphite')}>{w}</span>
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="ch-title">
          <h2 id="ch-title" className="text-lg font-semibold text-graphite">Reports by purchase channel</h2>
          <p className="mt-1 text-sm text-muted">Counterfeit = confirmed, or batch never produced.</p>
          <table className="mt-4 w-full text-left text-sm">
            <caption className="sr-only">Reports and suspected counterfeits by purchase channel</caption>
            <thead>
              <tr className="border-b border-gold text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Channel</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Reports</th>
                <th scope="col" className="py-2 text-right font-medium">Counterfeit</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {byChannel.map(([ch, v]) => (
                <tr key={ch} className="border-b border-mist">
                  <th scope="row" className="py-2 pr-3 font-medium text-graphite">{ch}</th>
                  <td className="py-2 pr-3 text-right text-graphite">{v.total}</td>
                  <td className={cn('py-2 text-right font-semibold', v.counterfeit ? 'text-error' : 'text-graphite')}>{v.counterfeit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="mt-10 text-lg font-semibold text-graphite">Customer feedback on the check</h2>
          <p className="mt-1 text-graphite">
            {feedback.length === 0
              ? 'No responses yet in this session. Responses appear here as customers answer “Was this helpful?”.'
              : `${Math.round((helpful / feedback.length) * 100)}% found it helpful (${feedback.length} responses).`}
          </p>
          {feedback.filter((f) => f.comment).slice(0, 3).map((f, i) => (
            <blockquote key={i} className="mt-2 border-l-2 border-gold pl-3 text-sm text-graphite">“{f.comment}” — {f.batch}</blockquote>
          ))}
        </section>
      </div>
    </div>
  )
}
