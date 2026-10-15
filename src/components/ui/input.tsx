import React from 'react'
import { cn } from '../../lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex min-h-11 w-full rounded-md border border-taupe bg-white px-3.5 py-2 text-base text-graphite placeholder:text-muted file:mr-3 file:rounded file:border-0 file:bg-sand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-burgundy aria-[invalid=true]:border-error aria-[invalid=true]:border-2 disabled:bg-mist',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-32 w-full rounded-md border border-taupe bg-white px-3.5 py-2.5 text-base text-graphite placeholder:text-muted aria-[invalid=true]:border-error aria-[invalid=true]:border-2',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex min-h-11 w-full rounded-md border border-taupe bg-white px-3 py-2 text-base text-graphite aria-[invalid=true]:border-error aria-[invalid=true]:border-2',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)
NativeSelect.displayName = 'NativeSelect'
