import React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex size-6 shrink-0 items-center justify-center rounded border-2 border-taupe bg-white data-[state=checked]:border-burgundy data-[state=checked]:bg-burgundy aria-[invalid=true]:border-error',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="text-white">
      <Check className="size-4" strokeWidth={3} aria-hidden="true" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = 'Checkbox'
