import { hrefFor } from '../lib/router'
import React from 'react'
import { ArrowRight } from 'lucide-react'
import type { PublicPage } from '../App'
import { useStore } from '../lib/store'
import { BatchSearchForm } from './BatchSearchForm'
import { ProductLineup } from './ProductLineup'

export function SearchHero({
  onSearch,
  checking,
  navigate,
}: {
  onSearch: (batch: string) => void
  checking: boolean
  navigate: (p: PublicPage) => void
}) {
  const recalls = useStore((s) => s.batches.filter((b) => b.status === 'recalled').length)

  return (
    <section aria-labelledby="hero-title" className="overflow-hidden">
      {recalls > 0 && (
        <div className="bg-error-bg">
          <p className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 px-5 py-2.5 text-sm text-graphite sm:px-8">
            <span className="font-semibold text-error">
              {recalls} active {recalls === 1 ? 'recall' : 'recalls'}.
            </span>
            <a
              href={hrefFor('recalls')}
              onClick={(e) => {
                e.preventDefault()
                navigate('recalls')
              }}
              className="inline-flex min-h-11 items-center gap-1 font-semibold text-burgundy underline underline-offset-4"
            >
              See which batches are affected <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </p>
        </div>
      )}
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-10 sm:px-8 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pb-20">
        <div className="max-w-xl">
          <h1
            id="hero-title"
            className="font-serif text-[2.25rem] font-semibold leading-[1.15] text-burgundy sm:text-5xl lg:text-[3.5rem] lg:leading-[1.12]"
          >
            Is your Bodylia pack genuine?
          </h1>
          <p className="mt-4 text-lg leading-7 text-graphite">
            Enter the batch number from your bottle, pouch or tub. In seconds you’ll see where and when it was made, when
            it expires, and its independent lab report.
          </p>
          <BatchSearchForm onSearch={onSearch} checking={checking} />
          <p className="mt-6 text-sm text-graphite">
            Already reported a pack?{' '}
            <a
              href={hrefFor('track')}
              onClick={(e) => {
                e.preventDefault()
                navigate('track')
              }}
              className="font-semibold text-burgundy underline underline-offset-4 hover:decoration-2"
            >
              Track your report
            </a>
          </p>
        </div>
        <ProductLineup />
      </div>
    </section>
  )
}
