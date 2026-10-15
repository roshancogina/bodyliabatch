import React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface FieldA11y {
  id: string
  'aria-invalid': boolean
  'aria-describedby'?: string
  'aria-required'?: boolean
}

interface FormFieldProps {
  id: string
  label: string
  optional?: boolean
  description?: string
  error?: string
  className?: string
  children: (a11y: FieldA11y) => React.ReactNode
}

/** shadcn-style Form item: visible label, hint and error are all programmatically linked. */
export function FormField({ id, label, optional, description, error, className, children }: FormFieldProps) {
  const descId = description ? `${id}-desc` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [descId, errId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <LabelPrimitive.Root htmlFor={id} className="text-sm font-semibold text-graphite">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted">(optional)</span>}
      </LabelPrimitive.Root>
      {description && (
        <p id={descId} className="text-sm text-muted">
          {description}
        </p>
      )}
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy, 'aria-required': !optional })}
      {error && (
        <p id={errId} className="flex items-start gap-1.5 text-sm font-medium text-error">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
