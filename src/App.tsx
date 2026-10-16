import React, { useCallback, useEffect, useRef, useState } from 'react'
import { SkipLink } from './components/SkipLink'
import { SiteHeader } from './components/SiteHeader'
import { SearchHero } from './components/SearchHero'
import { HowItWorks } from './components/HowItWorks'
import { ResultView } from './components/ResultView'
import { ReportForm } from './components/ReportForm'
import { ReportSubmitted } from './components/ReportSubmitted'
import { SiteFooter } from './components/SiteFooter'
import { TrackReport } from './components/public/TrackReport'
import { ActiveRecalls } from './components/public/ActiveRecalls'
import { FaqPage } from './components/public/FaqPage'
import { LegalPage } from './components/public/LegalPage'
import { NotFoundPage } from './components/public/NotFoundPage'
import { MaintenancePage } from './components/public/MaintenancePage'
import { Toaster } from './components/ui/toaster'
import { lookupBatch, type LookupResult } from './lib/bff'
import { useStore } from './lib/store'
import { AdminApp } from './admin/AdminApp'
import { consumeSuppressed, readRoute, writeRoute, type Route } from './lib/router'

export type PublicPage = 'home' | 'track' | 'recalls' | 'faq' | 'accessibility' | 'privacy' | 'terms'

type View =
  | { name: 'home' | 'track' | 'recalls' | 'faq' | 'accessibility' | 'privacy' | 'terms' | 'notfound'; prefill?: string }
  | { name: 'result'; batch: string; result: LookupResult }
  | { name: 'report'; batch: string }
  | { name: 'submitted'; reference: string }

const KNOWN: PublicPage[] = ['home', 'track', 'recalls', 'faq', 'accessibility', 'privacy', 'terms']

export function App() {
  const [view, setView] = useState<View>(() => viewFromRoute(readRoute()))
  const [checking, setChecking] = useState(false)
  const [staff, setStaff] = useState(() => readRoute().p === 'console')
  const maintenance = useStore((s) => s.settings.maintenance)
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  const runLookup = useCallback(async (batch: string, write = true) => {
    setChecking(true)
    try {
      const result = await lookupBatch(batch)
      setView({ name: 'result', batch, result })
    } catch {
      setView({ name: 'result', batch, result: { kind: 'error' } })
    } finally {
      setChecking(false)
    }
    if (write) writeRoute({ b: batch })
  }, [])

  // Deep links (QR ?b=…, #/?b=…) and Back/Forward restore the exact page.
  useEffect(() => {
    const apply = () => {
      const r = readRoute()
      setStaff(r.p === 'console')
      if (r.b) void runLookup(r.b.toUpperCase(), false)
      else setView(viewFromRoute(r))
    }
    const first = readRoute()
    if (first.b) void runLookup(first.b.toUpperCase(), false)
    const onHash = () => {
      if (!consumeSuppressed()) apply()
    }
    window.addEventListener('popstate', apply)
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('popstate', apply)
      window.removeEventListener('hashchange', onHash)
    }
  }, [runLookup])

  // Every navigation starts at the top; focus moves to the new h1 (skipped on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo({ top: 0 })
    mainRef.current?.querySelector<HTMLElement>('[data-autofocus], h1')?.focus()
  }, [view])

  useEffect(() => {
    document.title = `${TITLES[view.name] ?? 'Verify your pack'} · Bodylia`
  }, [view.name])

  const navigate = (page: PublicPage, prefill?: string) => {
    setView({ name: page, prefill })
    writeRoute({ p: page })
  }

  const openStaff = () => {
    setStaff(true)
    writeRoute({ p: 'console' })
  }

  if (staff)
    return (
      <>
        <AdminApp onExit={() => { setStaff(false); setView({ name: 'home' }); writeRoute({ p: 'home' }) }} />
        <Toaster />
      </>
    )

  if (maintenance) return <MaintenancePage onStaff={openStaff} />

  return (
    <div className="flex flex-col bg-ivory text-graphite">
      <SkipLink />
      <SiteHeader current={view.name} navigate={navigate} onStaff={openStaff} />
      <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 focus:outline-none">
        {view.name === 'home' && (
          <>
            <SearchHero onSearch={runLookup} checking={checking} navigate={navigate} />
            <HowItWorks navigate={navigate} />
          </>
        )}
        {view.name === 'result' && (
          <ResultView
            batch={view.batch}
            result={view.result}
            onBack={() => navigate('home')}
            onReport={() => setView({ name: 'report', batch: view.batch })}
          />
        )}
        {view.name === 'report' && (
          <ReportForm
            defaultBatch={view.batch}
            onCancel={() => navigate('home')}
            onSubmitted={(reference) => setView({ name: 'submitted', reference })}
          />
        )}
        {view.name === 'submitted' && (
          <ReportSubmitted reference={view.reference} onHome={() => navigate('home')} onTrack={() => navigate('track', view.reference)} />
        )}
        {view.name === 'track' && <TrackReport prefill={view.prefill} navigate={navigate} />}
        {view.name === 'recalls' && <ActiveRecalls onCheck={runLookup} />}
        {view.name === 'faq' && <FaqPage navigate={navigate} />}
        {(view.name === 'accessibility' || view.name === 'privacy' || view.name === 'terms') && <LegalPage page={view.name} />}
        {view.name === 'notfound' && <NotFoundPage onSearch={runLookup} checking={checking} navigate={navigate} />}
      </main>
      <SiteFooter navigate={navigate} />
      <Toaster />
    </div>
  )
}

const TITLES: Record<string, string> = {
  home: 'Verify your pack',
  result: 'Batch result',
  report: 'Report a suspicious pack',
  submitted: 'Report received',
  track: 'Track a report',
  recalls: 'Active recalls',
  faq: 'How verification works',
  accessibility: 'Accessibility statement',
  privacy: 'Privacy notice',
  terms: 'Terms of use',
  notfound: 'Page not found',
}

function viewFromRoute(r: Route): View {
  if (!r.p || r.p === 'console' || r.p === 'home') return { name: 'home' }
  return KNOWN.includes(r.p as PublicPage) ? { name: r.p as PublicPage } : { name: 'notfound' }
}
