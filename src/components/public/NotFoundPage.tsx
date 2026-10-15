import React from 'react'
import { BatchSearchForm } from '../BatchSearchForm'

export function NotFoundPage({ onSearch, checking }: { onSearch: (b: string) => void; checking: boolean }) {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-20 pt-12 sm:px-8 lg:pt-20">
      <p className="tabular font-serif text-6xl font-semibold text-gold" aria-hidden="true">404</p>
      <h1 data-autofocus tabIndex={-1} className="mt-2 font-serif text-[2.25rem] font-semibold leading-tight text-burgundy focus:outline-none sm:text-5xl">
        This page doesn’t exist
      </h1>
      <p className="mt-4 text-lg text-graphite">
        The link may be mistyped or out of date. If you came here to check a pack, you can do that right here.
      </p>
      <BatchSearchForm onSearch={onSearch} checking={checking} />
    </div>
  )
}
