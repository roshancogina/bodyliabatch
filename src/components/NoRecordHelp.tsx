import React from 'react'
import { Flag, RotateCcw } from 'lucide-react'
import type { LookupResult } from '../lib/bff'
import { Button } from './ui/button'

export function NoRecordHelp({
  result,
  onRetry,
  onReport,
}: {
  result: LookupResult
  onRetry: () => void
  onReport: () => void
}) {
  const notFound = result.kind === 'not_found'

  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[2fr_1fr]">
      {notFound ? (
        <div>
          <h2 className="font-serif text-2xl font-semibold text-burgundy">Before you report it, check these</h2>
          <ul className="mt-4 flex flex-col divide-y divide-mist border-y border-mist">
            {[
              ['Zero, not the letter O', 'Batch numbers never contain the letters O or I.'],
              ['Bodylia or vendor code?', 'Bodylia codes look like BDL-FR-2509-0312. Vendor lot codes (e.g. FR-2509-312) work too — enter exactly what is printed.'],
              ['Use the batch, not the barcode', 'The barcode digits are the same on every pack — the batch number isn’t.'],
            ].map(([t, d]) => (
              <li key={t} className="py-4">
                <p className="font-semibold text-graphite">{t}</p>
                <p className="mt-0.5 text-graphite/90">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-lg text-graphite">You can try again in a moment. Nothing you entered was lost.</p>
      )}
      <div className="flex flex-col gap-3">
        <Button size="lg" onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          Try again
        </Button>
        {notFound && (
          <Button variant="outline" size="lg" onClick={onReport}>
            <Flag aria-hidden="true" />
            Report a suspicious pack
          </Button>
        )}
      </div>
    </div>
  )
}
