import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown, Loader2, Search } from 'lucide-react'
import { batchSearchSchema, type BatchSearchInput } from '../lib/schemas'
import { DEMO_BATCHES } from '../data/batches'
import { SHOW_PREVIEW_HINTS } from '../lib/runtime-env'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { FormField } from './ui/form-field'
import { WhereToFindDialog } from './WhereToFindDialog'

export function BatchSearchForm({ onSearch, checking }: { onSearch: (batch: string) => void; checking: boolean }) {
  const [showDemo, setShowDemo] = React.useState(false)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<BatchSearchInput, unknown, { batch: string }>({
    resolver: zodResolver(batchSearchSchema),
    defaultValues: { batch: '' },
    shouldFocusError: true,
  })

  const submit = handleSubmit((data) => onSearch(data.batch))

  return (
    <form onSubmit={submit} noValidate className="mt-8" aria-label="Verify a batch">
      <FormField
        id="batch"
        label="Batch number"
        description="Printed near the expiry date — Bodylia code e.g. BDL-FR-2509-0312, or the vendor lot code on the pack"
        error={errors.batch?.message}
      >
        {(a11y) => (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              {...register('batch')}
              {...a11y}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              className="tabular min-h-13 text-lg font-semibold tracking-wide sm:flex-1"
            />
            <Button type="submit" size="lg" disabled={checking} className="min-h-13 sm:w-40">
              {checking ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Checking…
                </>
              ) : (
                <>
                  <Search aria-hidden="true" />
                  Verify batch
                </>
              )}
            </Button>
          </div>
        )}
      </FormField>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <WhereToFindDialog />
      </div>

      {SHOW_PREVIEW_HINTS && (
      <div className="mt-6 border-t border-mist pt-3">
        <button
          type="button"
          aria-expanded={showDemo}
          aria-controls="demo-list"
          onClick={() => setShowDemo((s) => !s)}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted hover:text-graphite"
        >
          <ChevronDown className={showDemo ? 'size-4 rotate-180 transition-transform duration-150' : 'size-4 transition-transform duration-150'} aria-hidden="true" />
          Preview data: try a sample batch
        </button>
        {showDemo && (
        <ul id="demo-list" className="mt-1 flex flex-wrap gap-2" aria-label="Sample batches">
          {DEMO_BATCHES.map((d) => (
            <li key={d.batch}>
              <button
                type="button"
                onClick={() => {
                  setValue('batch', d.batch, { shouldValidate: true })
                  onSearch(d.batch)
                }}
                className="tabular inline-flex min-h-11 items-center gap-2 rounded-md border border-stone bg-white px-3 text-sm text-graphite transition-colors duration-150 hover:border-taupe hover:bg-sand"
              >
                <span className="font-semibold">{d.batch}</span>
                <span className="text-muted">· {d.label}</span>
              </button>
            </li>
          ))}
        </ul>
        )}
      </div>
      )}
      <p className="sr-only" aria-live="polite">
        {checking ? 'Checking batch number…' : ''}
      </p>
    </form>
  )
}
