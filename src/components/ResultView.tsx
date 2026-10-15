import React from 'react'
import { ArrowLeft } from 'lucide-react'
import type { LookupResult } from '../lib/bff'
import { getProduct, listProducts } from '../lib/products'
import { Button } from './ui/button'
import { VerdictBand } from './VerdictBand'
import { BatchFacts } from './BatchFacts'
import { NoRecordHelp } from './NoRecordHelp'
import { ShareFeedback } from './public/ShareFeedback'

interface Props {
  batch: string
  result: LookupResult
  onBack: () => void
  onReport: () => void
}

export function ResultView({ batch, result, onBack, onReport }: Props) {
  const record = 'record' in result ? result.record : null
  const product = record ? getProduct(record.product) : null

  return (
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-6 sm:px-8 lg:pb-24">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-3">
        <ArrowLeft aria-hidden="true" />
        Check another batch
      </Button>

      <VerdictBand batch={batch} result={result} />

      {record && product ? (
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <div className="flex items-end justify-center rounded-lg bg-sand px-8 pb-6 pt-10 lg:sticky lg:top-6 lg:self-start">
            <img src={product.image} alt={`${product.name} pack`} className="max-h-[360px] w-auto" />
          </div>
          <BatchFacts record={record} product={product} kind={result.kind} onReport={onReport} />
        </div>
      ) : (
        <NoRecordHelp result={result} onRetry={onBack} onReport={onReport} />
      )}
      {result.kind !== 'error' && result.kind !== 'rate_limited' && <ShareFeedback batch={batch} />}
    </div>
  )
}
