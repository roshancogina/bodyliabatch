import React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from './ui/button'
import { useStore } from '../lib/store'

export function ReportSubmitted({ reference, onHome, onTrack }: { reference: string; onHome: () => void; onTrack: () => void }) {
  const hours = useStore((s) => s.settings.replyTargetHours)
  return (
    <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8 lg:py-24">
      <CheckCircle2 className="size-12 text-success" strokeWidth={1.75} aria-hidden="true" />
      <h1 data-autofocus tabIndex={-1} className="mt-4 font-serif text-[2rem] font-semibold leading-tight text-burgundy sm:text-[2.75rem]">
        Thank you — report received
      </h1>
      <p className="mt-4 text-lg text-graphite">
        Your reference is <strong className="tabular">{reference}</strong>. We’ve emailed you a copy. Our quality team
        will reply within {hours / 24 >= 1 && hours % 24 === 0 ? `${hours / 24} working days` : `${hours} hours`}.
      </p>
      <h2 className="mt-8 font-semibold text-graphite">What happens next</h2>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-graphite">
        <li>A support specialist reviews your report and photo.</li>
        <li>If the batch looks suspicious, our quality team investigates it with the manufacturer’s records.</li>
        <li>We email you the outcome, and a replacement or refund if your pack isn’t genuine.</li>
      </ol>
      <p className="mt-4 text-graphite">Until then, please keep the pack and don’t consume it.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={onTrack}>Track this report</Button>
        <Button size="lg" variant="outline" onClick={onHome}>Check another batch</Button>
      </div>
    </div>
  )
}
