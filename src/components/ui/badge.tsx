import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5', {
  variants: {
    tone: {
      neutral: 'bg-mist text-graphite',
      success: 'bg-success-bg text-success',
      warning: 'bg-warning-bg text-warning-ink',
      error: 'bg-error-bg text-error',
      info: 'bg-info-bg text-info',
      brand: 'bg-burgundy text-white',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({
  tone,
  className,
  children,
}: VariantProps<typeof badgeVariants> & { className?: string; children: React.ReactNode }) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>
}
