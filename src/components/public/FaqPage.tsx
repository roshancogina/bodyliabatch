import React from 'react'
import { ChevronDown } from 'lucide-react'
import type { PublicPage } from '../../App'
import { Button } from '../ui/button'

/** Ordered by support-ticket volume (most asked first). */
const FAQ: [string, string][] = [
  [
    'My batch number wasn’t found. Is my pack fake?',
    'Not necessarily. Most “not found” results are typing errors — batch numbers never contain the letters O or I, so check for zeros and ones. If it still isn’t found, report the pack: we’ll investigate within 2 working days and replace it if it isn’t genuine.',
  ],
  [
    'Where exactly is the batch number?',
    'On bottles it’s printed on the base beside “EXP”. On sachet pouches it’s in the crimped strip on the back. On tubs it’s under the lid rim. It always starts with BDL-.',
  ],
  [
    'What does the lab report (Certificate of Analysis) prove?',
    'An accredited independent laboratory tested a sample of that exact batch before release: the active ingredient is at the labelled strength, microbial counts are within safe limits, and heavy metals such as lead and arsenic are below regulatory thresholds.',
  ],
  [
    'My pack is genuine but expired. What should I do?',
    'Don’t consume it — expired supplements can lose potency. Dispose of it with household waste. If the pack was already expired when you bought it, report it and we’ll replace it.',
  ],
  [
    'What happens to the details I give when I report a pack?',
    'We use them only to investigate your report and reply to you. We keep them for 12 months, then delete them automatically. We never sell or share them for marketing.',
  ],
  [
    'Can I check a pack bought outside India?',
    'Yes. Every Bodylia batch, wherever it’s sold, is registered here. If you bought it from a marketplace seller, the check is especially worthwhile.',
  ],
]

export function FaqPage({ navigate }: { navigate: (p: PublicPage) => void }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1fr_2fr] lg:pt-16">
      <div>
        <h1 data-autofocus tabIndex={-1} className="font-serif text-[2.25rem] font-semibold leading-tight text-burgundy focus:outline-none sm:text-5xl">
          How verification works
        </h1>
        <p className="mt-4 text-lg text-graphite">
          Every batch we release is registered with its manufacturing record and independent lab results before it ships.
          Your check compares the number on your pack against that record in real time.
        </p>
        <Button className="mt-6" size="lg" onClick={() => navigate('home')}>Verify a pack</Button>
      </div>
      <div>
        <h2 className="sr-only">Frequently asked questions</h2>
        <ul className="border-t border-mist">
          {FAQ.map(([q, a]) => (
            <li key={q} className="border-b border-mist">
              <details className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-semibold text-graphite [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown className="size-5 shrink-0 text-burgundy transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="pb-5 pr-8 leading-7 text-graphite">{a}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
