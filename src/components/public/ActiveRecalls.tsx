import React, { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Loader2, ShieldCheck } from 'lucide-react'
import { fetchRecalls } from '../../lib/bff'
import { getProduct } from '../../lib/products'
import { SUPPORT_EMAIL } from '../../data/catalog-static'
import { Button } from '../ui/button'
import type { BatchRecord } from '../../data/batches'

export function ActiveRecalls({ onCheck }: { onCheck: (batch: string) => void }) {
  const [recalled, setRecalled] = useState<BatchRecord[] | null>(null)
  const email = SUPPORT_EMAIL
  useEffect(() => {
    let live = true
    fetchRecalls()
      .then((r) => { if (live) setRecalled(r) })
      .catch(() => { if (live) setRecalled([]) })
    return () => { live = false }
  }, [])

  const recalledOn = (_batch: string): string | undefined => undefined

  if (recalled === null) {
    return (
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-10 sm:px-8 lg:pt-16" role="status" aria-live="polite">
        <p className="inline-flex items-center gap-2 text-graphite"><Loader2 className="animate-spin" aria-hidden="true" /> Loading recalls…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-5 pb-20 pt-10 sm:px-8 lg:pt-16">
      <h1 data-autofocus tabIndex={-1} className="font-serif text-[2.25rem] font-semibold leading-tight text-burgundy focus:outline-none sm:text-5xl">
        Active recalls
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-graphite">
        When a batch doesn’t meet our standard, we recall it and list it here the same day. Only the batches listed are
        affected — every other batch of the same product is safe to use.
      </p>

      {recalled.length === 0 ? (
        <div className="mt-10 flex items-start gap-4 rounded-lg bg-success-bg p-6">
          <ShieldCheck className="size-8 shrink-0 text-success" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-semibold text-success">No active recalls</h2>
            <p className="mt-1 text-graphite">Every Bodylia batch currently on sale meets its release specification.</p>
          </div>
        </div>
      ) : (
        <ul className="mt-10 flex flex-col gap-6">
          {recalled.map((b) => {
            const p = getProduct(b.product)
            const on = recalledOn(b.batch)
            return (
              <li key={b.batch} className="grid gap-6 rounded-lg bg-white p-6 ring-1 ring-mist sm:grid-cols-[7rem_1fr]">
                <div className="flex h-28 items-end justify-center rounded-md bg-sand p-2">
                  <img src={p.image} alt="" className="max-h-full w-auto" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-semibold text-burgundy">
                    {p.name} · <span className="tabular">{b.batch}</span>
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Manufactured {format(new Date(b.manufactured), 'd MMM yyyy')}
                    {on && ` · recalled ${format(new Date(on), 'd MMM yyyy')}`}
                  </p>
                  <p className="mt-3 text-graphite">{b.recallReason}</p>
                  <h3 className="mt-4 font-semibold text-graphite">What to do</h3>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-graphite">
                    <li>Stop using the pack.</li>
                    <li>
                      Email a photo of the batch number to{' '}
                      <a href={`mailto:${email}?subject=Recall ${b.batch}`} className="font-semibold text-burgundy underline underline-offset-4">{email}</a>.
                    </li>
                    <li>We’ll send a replacement or refund within 5 working days, and collect the recalled pack.</li>
                  </ol>
                  <Button variant="outline" className="mt-4" onClick={() => onCheck(b.batch)}>
                    View batch details
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
