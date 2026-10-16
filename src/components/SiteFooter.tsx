import { hrefFor } from '../lib/router'
import React from 'react'
import { ExternalLink } from 'lucide-react'
import type { PublicPage } from '../App'
import { SUPPORT_EMAIL } from '../data/catalog-static'

export function SiteFooter({ navigate }: { navigate: (p: PublicPage) => void }) {
  const email = SUPPORT_EMAIL
  const links: [string, PublicPage | string][] = [
    ['Track a report', 'track'],
    ['Active recalls', 'recalls'],
    ['How verification works', 'faq'],
    ['Accessibility', 'accessibility'],
    ['Privacy', 'privacy'],
    ['Terms', 'terms'],
    ['Contact support', `mailto:${email}`],
    ['Shop Bodylia', 'https://bodylia.in'],
  ]
  return (
    <footer className="bg-plum text-ivory">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1fr_auto]">
        <div className="max-w-md">
          <p className="font-serif text-xl font-semibold">Bodylia</p>
          <p className="mt-1 text-sm tracking-[0.2em] text-ivory/85">NATURE · SCIENCE · YOU</p>
          <p className="mt-4 text-sm text-ivory/85">
            Dietary supplements. Not for medicinal use. Not intended to diagnose, treat, cure or prevent any disease.
          </p>
          <address className="mt-4 text-sm not-italic text-ivory/85">
            B-208, Pavan Plaza, Opp Lifecare Hospital, Lakhudi Talav, Naranpura, Ahmedabad 380 013, India
            <br />
            <a href="tel:+919081900473" className="underline underline-offset-4 hover:decoration-2">
              +91-9081900473
            </a>{' '}
            ·{' '}
            <a href={`mailto:${email}`} className="underline underline-offset-4 hover:decoration-2">
              {email}
            </a>
          </address>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-8 text-sm sm:grid-cols-4 md:grid-cols-2">
            {links.map(([label, target]) => (
              <li key={label}>
                <a
                  href={target.includes(':') ? target : hrefFor(target)}
                  onClick={(e) => {
                    if (target.includes(':')) return
                    e.preventDefault()
                    navigate(target as PublicPage)
                  }}
                  {...(target.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="inline-flex min-h-11 items-center gap-1 underline decoration-1 underline-offset-4 hover:decoration-2"
                >
                  {label}
                  {target.startsWith('http') && (
                    <>
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      <span className="sr-only"> (opens bodylia.in in a new tab)</span>
                    </>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-ivory/15">
        <p className="mx-auto max-w-6xl px-5 py-4 text-xs text-ivory/85 sm:px-8">© {new Date().getFullYear()} Bodylia (USA) · batch.bodylia.in</p>
      </div>
    </footer>
  )
}
