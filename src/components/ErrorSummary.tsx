import React from 'react'
import { AlertCircle } from 'lucide-react'

interface Props {
  errors: { id: string; label: string; message: string }[]
}

/** GOV.UK-style error summary: receives focus on failed submit, links jump to each field. */
export const ErrorSummary = React.forwardRef<HTMLDivElement, Props>(({ errors }, ref) => (
  <div
    ref={ref}
    tabIndex={-1}
    role="alert"
    aria-labelledby="error-summary-title"
    className="mt-8 rounded-md border-2 border-error bg-error-bg p-5"
  >
    <h2 id="error-summary-title" className="flex items-center gap-2 text-lg font-semibold text-error">
      <AlertCircle className="size-5" aria-hidden="true" />
      There {errors.length === 1 ? 'is 1 problem' : `are ${errors.length} problems`} with your report
    </h2>
    <ul className="mt-3 flex flex-col gap-1.5">
      {errors.map((e) => (
        <li key={e.id}>
          <a
            href={`#${e.id}`}
            onClick={(ev) => {
              ev.preventDefault()
              document.getElementById(e.id)?.focus()
            }}
            className="inline-flex min-h-6 font-medium text-burgundy underline underline-offset-4 hover:decoration-2"
          >
            {e.label}: {e.message}
          </a>
        </li>
      ))}
    </ul>
  </div>
))
ErrorSummary.displayName = 'ErrorSummary'
