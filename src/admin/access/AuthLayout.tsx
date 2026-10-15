import React, { useEffect, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { GLYPH, WORDMARK } from '../../data/products'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'

/** Shared frame for every staff-access screen: brand panel left, task card right. */
export function AuthLayout({
  title,
  lead,
  back,
  className,
  aside,
  children,
}: {
  title: string
  lead?: React.ReactNode
  back?: { label: string; onClick: () => void }
  className?: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  const h1 = useRef<HTMLHeadingElement>(null)
  // Each access step is a new "page": title it (2.4.2) and move focus to its heading.
  useEffect(() => {
    document.title = `${title} · Bodylia batch console`
    h1.current?.focus()
  }, [title])

  return (
    <main className={cn('flex flex-col bg-sand', className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-6 sm:px-8">
        <div className="flex min-h-11 items-center">
          {back && (
            <Button variant="ghost" size="sm" onClick={back.onClick} className="-ml-3">
              <ArrowLeft aria-hidden="true" />
              {back.label}
            </Button>
          )}
        </div>
        <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[1fr_460px] lg:gap-16">
          <div className="hidden lg:block">
            <div className="flex items-center gap-3">
              <img src={GLYPH} alt="" className="size-10" />
              <img src={WORDMARK} alt="Bodylia" className="h-7 w-auto" />
            </div>
            <p className="mt-8 max-w-md font-serif text-5xl font-semibold leading-[1.12] text-burgundy">Batch console</p>
            <div className="mt-4 max-w-md text-lg text-graphite">
              {aside ?? 'Register released batches, issue recalls and resolve customer reports. Every change is recorded in the audit log.'}
            </div>
          </div>
          <section aria-labelledby="auth-title" className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-mist sm:p-8">
            <div className="mb-5 flex items-center gap-2 lg:hidden">
              <img src={GLYPH} alt="" className="size-7" />
              <img src={WORDMARK} alt="Bodylia" className="h-5 w-auto" />
            </div>
            <h1 ref={h1} id="auth-title" tabIndex={-1} className="font-serif text-[1.75rem] font-semibold leading-tight text-burgundy focus:outline-none">
              {title}
            </h1>
            {lead && <div className="mt-1.5 text-sm text-muted">{lead}</div>}
            <div className="mt-6">{children}</div>
          </section>
        </div>
      </div>
    </main>
  )
}
