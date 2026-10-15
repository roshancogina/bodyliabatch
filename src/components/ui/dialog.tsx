import React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  title,
  description,
  className,
  children,
}: {
  title: string
  description?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dlg-overlay fixed inset-0 z-40 bg-plum/60" />
      <DialogPrimitive.Content
        className={cn(
          'dlg-content fixed left-1/2 top-1/2 z-50 flex max-h-[min(90dvh,760px)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-white shadow-xl',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <div className="flex items-start justify-between gap-4 border-b border-mist px-6 py-5">
          <div>
            <DialogPrimitive.Title className="font-serif text-2xl font-semibold text-burgundy">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="-mr-2 -mt-1 inline-flex size-11 items-center justify-center rounded-md text-graphite transition-colors duration-150 hover:bg-sand"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
