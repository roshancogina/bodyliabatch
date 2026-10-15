import React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

/** Right-hand side panel (shadcn Sheet) for record detail. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dlg-overlay fixed inset-0 z-40 bg-plum/50" />
        <DialogPrimitive.Content
          className="sheet-content fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-xl"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="flex items-start justify-between gap-4 border-b border-mist px-6 py-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="tabular font-serif text-2xl font-semibold text-burgundy">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close
              aria-label="Close panel"
              className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-graphite transition-colors duration-150 hover:bg-sand"
            >
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="border-t border-mist bg-ivory px-6 py-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
