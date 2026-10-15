import React from 'react'
import { ArrowRight } from 'lucide-react'
import type { SuspiciousReport } from '../../data/admin-seed'
import { cn } from '../../lib/utils'

export interface Finding {
  headline: string
  evidence: string
  action?: { label: string; run: () => void }
  tone?: 'error' | 'warning' | 'success' | 'neutral'
}

/** Pyramid-principle findings: conclusion first, evidence second, one action. */
export function Findings({ items, title = 'What needs your attention' }: { items: Finding[]; title?: string }) {
  return (
    <section aria-labelledby="findings-title">
      <h2 id="findings-title" className="sr-only">{title}</h2>
      <ol className="flex flex-col divide-y divide-mist border-y border-mist">
        {items.map((f, i) => (
          <li key={f.headline} className="grid gap-3 py-5 sm:grid-cols-[2rem_1fr_auto] sm:items-start sm:gap-5">
            <span aria-hidden="true" className="tabular font-serif text-2xl font-semibold text-gold">{i + 1}</span>
            <div>
              <p className={cn('text-lg font-semibold leading-snug', f.tone === 'error' ? 'text-error' : f.tone === 'warning' ? 'text-warning-ink' : 'text-graphite')}>
                {f.headline}
              </p>
              <p className="mt-1 text-graphite/90">{f.evidence}</p>
            </div>
            {f.action && (
              <button onClick={f.action.run} className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-burgundy underline decoration-1 underline-offset-4 hover:decoration-2">
                {f.action.label} <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** 14-day bar trend with an accessible text equivalent. */
export function Trend({ total, highlight, label, highlightLabel }: { total: number[]; highlight: number[]; label: string; highlightLabel: string }) {
  const max = Math.max(...total)
  const sum = total.reduce((a, b) => a + b, 0)
  const hs = highlight.reduce((a, b) => a + b, 0)
  const last7 = total.slice(7).reduce((a, b) => a + b, 0)
  const prev7 = total.slice(0, 7).reduce((a, b) => a + b, 0)
  const delta = Math.round(((last7 - prev7) / prev7) * 100)
  return (
    <figure>
      <p className="text-graphite">
        <span className="tabular font-serif text-4xl font-semibold text-burgundy">{sum.toLocaleString('en-IN')}</span>
        <span className="ml-2 text-sm text-muted">{label}, 14 days · <span className="font-semibold text-graphite">{delta >= 0 ? '+' : ''}{delta}%</span> week on week</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        <span className="tabular font-semibold text-graphite">{((hs / sum) * 100).toFixed(1)}%</span> {highlightLabel}
      </p>
      <div className="mt-4 flex h-28 items-end gap-1" aria-hidden="true">
        {total.map((v, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end">
            <div className="rounded-t-sm bg-taupe" style={{ height: `${((v - highlight[i]) / max) * 100}%` }} />
            <div className="bg-burgundy" style={{ height: `${Math.max((highlight[i] / max) * 300, 2)}%` }} />
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-taupe" aria-hidden="true" />Found</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-burgundy" aria-hidden="true" />{highlightLabel} (scaled ×3)</span>
        <span className="sr-only">Daily totals oldest first: {total.join(', ')}. {highlightLabel}: {highlight.join(', ')}.</span>
      </figcaption>
    </figure>
  )
}

export function hoursLeft(r: SuspiciousReport, targetHours: number) {
  return targetHours - (Date.now() - new Date(r.createdAt).getTime()) / 3_600_000
}

export function DueLabel({ hours }: { hours: number }) {
  if (hours < 0) return <span className="font-semibold text-error">Overdue by {Math.ceil(-hours)} h</span>
  if (hours < 12) return <span className="font-semibold text-warning-ink">Due in {Math.floor(hours)} h</span>
  return <span className="text-muted">Due in {Math.floor(hours)} h</span>
}
