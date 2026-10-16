import React from 'react'
import { ArrowLeft, PackageSearch } from 'lucide-react'
import { Button } from '../ui/button'
import { BatchSearchForm } from '../BatchSearchForm'
import type { PublicPage } from '../../App'

/** Branded 404: same header/footer as every page (rendered by App), with a working verify form. */
export function NotFoundPage({
  onSearch,
  checking,
  navigate,
}: {
  onSearch: (b: string) => void
  checking: boolean
  navigate?: (p: PublicPage) => void
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-20 pt-12 sm:px-8 lg:pt-20">
      <p className="tabular font-serif text-6xl font-semibold text-gold" aria-hidden="true">
        404
      </p>
      <h1 data-autofocus tabIndex={-1} className="mt-2 font-serif text-[2.25rem] font-semibold leading-tight text-burgundy focus:outline-none sm:text-5xl">
        This page doesn’t exist
      </h1>
      <p className="mt-4 text-lg text-graphite">
        The link may be mistyped or out of date. If you came here to check a pack, you can do that right here — every code on your pack works.
      </p>
      <div className="mt-6 flex items-start gap-4 rounded-lg bg-sand p-5">
        <PackageSearch className="size-8 shrink-0 text-burgundy" strokeWidth={1.75} aria-hidden="true" />
        <div className="text-graphite">
          <h2 className="font-semibold">What you can do next</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            <li>Check the web address for typos.</li>
            <li>Verify a batch below — canonical codes like PE-2610-WL01 and manufacturer codes like 2K26001 both work.</li>
            <li>Use the header menu to track a report or read active recalls.</li>
          </ul>
        </div>
      </div>
      <BatchSearchForm onSearch={onSearch} checking={checking} />
      {navigate && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => navigate('home')}>
            <ArrowLeft aria-hidden="true" />
            Verify a pack
          </Button>
          <Button variant="outline" onClick={() => navigate('track')}>
            Track a report
          </Button>
          <Button variant="outline" onClick={() => navigate('recalls')}>
            Active recalls
          </Button>
        </div>
      )}
    </div>
  )
}
