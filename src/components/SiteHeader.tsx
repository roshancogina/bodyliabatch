import { hrefFor } from '../lib/router'
import React, { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { GLYPH, WORDMARK } from '../data/catalog-static'
import type { PublicPage } from '../App'
import { cn } from '../lib/utils'

const LINKS: { page: PublicPage; label: string }[] = [
  { page: 'home', label: 'Verify a pack' },
  { page: 'track', label: 'Track a report' },
  { page: 'recalls', label: 'Active recalls' },
  { page: 'faq', label: 'How it works' },
]

export function SiteHeader({
  current,
  navigate,
  onStaff,
}: {
  current: string
  navigate: (p: PublicPage) => void
  onStaff: () => void
}) {
  const [open, setOpen] = useState(false)
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const go = (p: PublicPage) => {
    setOpen(false)
    navigate(p)
  }
  const isCurrent = (p: PublicPage) => current === p || (p === 'home' && ['result', 'report', 'submitted'].includes(current))

  return (
    <header className="border-b border-mist bg-ivory">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <a
          href={hrefFor('home')}
          onClick={(e) => {
            e.preventDefault()
            go('home')
          }}
          className="flex min-h-11 items-center gap-2.5"
        >
          <img src={GLYPH} alt="" className="size-8" />
          <img src={WORDMARK} alt="Bodylia — batch verification home" className="h-6 w-auto" />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.page}
              href={hrefFor(l.page)}
              aria-current={isCurrent(l.page) ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault()
                go(l.page)
              }}
              className={cn(
                'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors duration-150',
                isCurrent(l.page) ? 'text-burgundy underline decoration-2 underline-offset-8' : 'text-graphite hover:bg-sand',
              )}
            >
              {l.label}
            </a>
          ))}
          <button
            onClick={onStaff}
            className="ml-3 inline-flex min-h-11 items-center rounded-md border border-burgundy px-3 text-sm font-semibold text-burgundy transition-colors duration-150 hover:bg-sand"
          >
            Staff sign in
          </button>
        </nav>

        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-burgundy hover:bg-sand lg:hidden"
        >
          {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          Menu
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-mist px-5 pb-4 pt-2 lg:hidden">
          <ul className="flex flex-col">
            {LINKS.map((l) => (
              <li key={l.page}>
                <button
                  onClick={() => go(l.page)}
                  aria-current={isCurrent(l.page) ? 'page' : undefined}
                  className={cn('flex min-h-12 w-full items-center border-b border-mist text-left text-base', isCurrent(l.page) ? 'font-semibold text-burgundy' : 'text-graphite')}
                >
                  {l.label}
                </button>
              </li>
            ))}
            <li>
              <button onClick={onStaff} className="flex min-h-12 w-full items-center text-left text-base font-semibold text-burgundy">
                Staff sign in
              </button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  )
}
