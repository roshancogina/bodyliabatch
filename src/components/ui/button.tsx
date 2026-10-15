import React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] disabled:pointer-events-none disabled:bg-mist disabled:text-muted [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-burgundy text-white hover:bg-burgundy-hover',
        outline: 'border border-burgundy bg-transparent text-burgundy hover:bg-sand',
        ghost: 'text-burgundy hover:bg-sand',
        link: 'px-0 text-burgundy underline underline-offset-4 decoration-1 hover:decoration-2 active:scale-100',
      },
      size: {
        default: 'min-h-11 px-5 text-sm',
        lg: 'min-h-12 px-6 text-base',
        sm: 'min-h-11 px-3 text-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  },
)
Button.displayName = 'Button'
