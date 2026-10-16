import React from 'react'
import { format } from 'date-fns'
import { Wrench } from 'lucide-react'
import { GLYPH, WORDMARK } from '../../data/products'
import { useStore } from '../../lib/store'
import type { PublicPage } from '../../App'
import { SiteHeader } from '../SiteHeader'
import { SiteFooter } from '../SiteFooter'

/** Shown to the public when an administrator turns on maintenance mode (Settings). */
export function MaintenancePage({
  onStaff,
  preview,
  navigate,
}: {
  onStaff?: () => void
  preview?: boolean
  navigate?: (p: PublicPage) => void
}) {
  const Main = preview ? 'div' : 'main'
  const Heading = preview ? 'p' : 'h1'
  const s = useStore((st) => st.settings)
  if (preview) {
    return (
      <div className="flex flex-col bg-ivory">
        <MaintenanceBody s={s} Main={Main} Heading={Heading} onStaff={onStaff} preview />
      </div>
    )
  }
  const noop = () => {
    /* keeps preview layouts honest without dead-code warnings */
  }
  void noop
  // Header/footer consistency: reuse the shared SiteHeader/SiteFooter whenever
  // navigation is available; the bare fallback only renders for bare-mode
  // embeds that pass neither (never a real route — App always passes both).
  const header = navigate && onStaff
    ? <SiteHeader current="home" navigate={navigate} onStaff={onStaff} />
    : navigate
      ? <SiteHeader current="home" navigate={navigate} onStaff={onStaff ?? (() => {})} />
      : (
        <header className="border-b border-mist bg-ivory">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
            <div className="flex items-center gap-2.5">
              <img src={GLYPH} alt="" className="size-8" />
              <img src={WORDMARK} alt="Bodylia" className="h-6 w-auto" />
            </div>
            {onStaff && (
              <button onClick={onStaff} className="inline-flex min-h-11 items-center text-sm font-semibold text-burgundy underline underline-offset-4">
                Staff sign in
              </button>
            )}
          </div>
        </header>
      )
  return (
    <div className="flex min-h-screen flex-col bg-ivory text-graphite">
      {header}
      <Main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-24 pt-12 sm:px-8 lg:pt-20">
        <MaintenanceBody s={s} Main={React.Fragment} Heading={Heading} onStaff={undefined} preview={false} bare />
      </Main>
      {navigate ? <SiteFooter navigate={navigate} /> : null}
    </div>
  )
}

function MaintenanceBody({
  s,
  Main,
  Heading,
  onStaff,
  preview,
  bare,
}: {
  s: { maintenanceMessage: string; maintenanceUntil: string; supportEmail: string }
  Main: 'div' | 'main' | typeof React.Fragment
  Heading: 'p' | 'h1'
  onStaff?: () => void
  preview?: boolean
  bare?: boolean
}) {
  void onStaff
  void bare
  const inner = (
    <>
      <Wrench className="size-12 text-burgundy" strokeWidth={1.5} aria-hidden="true" />
      <Heading className="mt-4 font-serif text-[2.25rem] font-semibold leading-tight text-burgundy sm:text-5xl">
        Batch checks are briefly paused
      </Heading>
      <p className="mt-4 text-lg text-graphite">{s.maintenanceMessage}</p>
      {s.maintenanceUntil && (
        <p className="mt-4 text-graphite">
          Expected back by <strong>{format(new Date(s.maintenanceUntil), 'd MMM yyyy, h:mm a')}</strong> (IST).
        </p>
      )}
      <p className="mt-6 text-graphite">
        Please don’t throw your pack away. Urgent concern? Email{' '}
        {preview ? (
          <strong>{s.supportEmail}</strong>
        ) : (
          <a href={`mailto:${s.supportEmail}`} className="font-semibold text-burgundy underline underline-offset-4">
            {s.supportEmail}
          </a>
        )}
        .
      </p>
    </>
  )
  if (Main === React.Fragment) return inner
  const Wrap = Main as 'div' | 'main'
  return (
    <Wrap className="mx-auto w-full max-w-2xl px-5 pb-24 pt-12 sm:px-8 lg:pt-20">
      {!preview && onStaff && (
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <img src={GLYPH} alt="" className="size-8" />
            <img src={WORDMARK} alt="Bodylia" className="h-6 w-auto" />
          </div>
          <button onClick={onStaff} className="inline-flex min-h-11 items-center text-sm font-semibold text-burgundy underline underline-offset-4">
            Staff sign in
          </button>
        </header>
      )}
      {inner}
    </Wrap>
  )
}
