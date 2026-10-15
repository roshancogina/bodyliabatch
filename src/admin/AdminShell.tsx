import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  BarChart3, Building2, ExternalLink, FileWarning, Inbox, LayoutDashboard, LogOut, Package, ScrollText, Search, Settings as SettingsIcon, UserCircle, Users,
} from 'lucide-react'
import { ROLE_LABEL, type StaffUser } from '../data/admin-seed'
import { GLYPH } from '../data/products'
import { can, type Permission } from '../lib/auth'
import { useStore } from '../lib/store'
import { cn } from '../lib/utils'
import { OverviewRouter } from './overview/OverviewRouter'
import { BatchesPage } from './BatchesPage'
import { BulkImportPage } from './batches/BulkImportPage'
import { ReportsPage } from './ReportsPage'
import { EscalationsPage } from './reports/EscalationsPage'
import { IntelligencePage } from './IntelligencePage'
import { UsersPage } from './UsersPage'
import { CataloguePage } from './catalogue/CataloguePage'
import { SettingsPage } from './SettingsPage'
import { AuditPage } from './AuditPage'
import { AccountPage } from './AccountPage'
import { NotPermitted } from './NotPermitted'
import { CommandSearch } from './shell/CommandSearch'
import { NotificationsButton } from './shell/NotificationsButton'
import { SessionTimeout } from './shell/SessionTimeout'

export type Section =
  | 'overview' | 'reports' | 'escalations' | 'batches' | 'import' | 'intelligence'
  | 'users' | 'catalogue' | 'settings' | 'audit' | 'account'

export interface Focus {
  batch?: string
  report?: string
}

export type Go = (s: Section, focus?: Focus) => void

export const SECTION_PERMISSION: Partial<Record<Section, Permission>> = {
  reports: 'reports.view',
  escalations: 'escalations.handle',
  batches: 'batches.view',
  import: 'batches.import',
  intelligence: 'intelligence.view',
  users: 'users.manage',
  catalogue: 'catalogue.manage',
  settings: 'settings.manage',
  audit: 'audit.view',
}

export const SECTION_TITLE: Record<Section, string> = {
  overview: 'Overview', reports: 'Reports', escalations: 'Escalations', batches: 'Batches', import: 'Bulk import',
  intelligence: 'Intelligence', users: 'Staff & roles', catalogue: 'Catalogue', settings: 'Settings', audit: 'Audit log', account: 'My account',
}

const GROUPS: { label: string; items: { id: Section; label: string; icon: typeof Package }[] }[] = [
  {
    label: 'Work',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'reports', label: 'Reports', icon: FileWarning },
      { id: 'escalations', label: 'Escalations', icon: Inbox },
      { id: 'batches', label: 'Batches', icon: Package },
    ],
  },
  { label: 'Insight', items: [{ id: 'intelligence', label: 'Intelligence', icon: BarChart3 }] },
  {
    label: 'Administration',
    items: [
      { id: 'users', label: 'Staff & roles', icon: Users },
      { id: 'catalogue', label: 'Catalogue', icon: Building2 },
      { id: 'settings', label: 'Settings', icon: SettingsIcon },
      { id: 'audit', label: 'Audit log', icon: ScrollText },
    ],
  },
]

export function AdminShell({
  user: initialUser,
  onSignOut,
  onExit,
  className,
}: {
  user: StaffUser
  onSignOut: (reason: 'manual' | 'timeout') => void
  onExit?: () => void
  className?: string
}) {
  const user = useStore((s) => s.users.find((u) => u.id === initialUser.id)) ?? initialUser
  const [section, setSection] = useState<Section>('overview')
  const [focus, setFocus] = useState<Focus>({})
  const [searchOpen, setSearchOpen] = useState(false)
  const [previewTimeout, setPreviewTimeout] = useState(0)
  const mainRef = useRef<HTMLElement>(null)
  const newReports = useStore((s) => s.reports.filter((r) => r.status === 'new').length)
  const openEsc = useStore((s) => s.reports.filter((r) => r.escalation?.state === 'open').length)

  const go: Go = useCallback((s, f = {}) => {
    setSection(s)
    setFocus(f)
  }, [])

  useEffect(() => {
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus()
    document.title = `${SECTION_TITLE[section]} · Bodylia batch console`
  }, [section])

  // ⌘K / Ctrl+K opens command search. Keyboard-triggered: no animation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const badge = (id: Section) => (id === 'reports' ? newReports : id === 'escalations' ? openEsc : 0)
  const perm = SECTION_PERMISSION[section]
  const allowed = !perm || can(user, perm)

  return (
    <div className={cn('flex scroll-pt-20 flex-col bg-ivory text-graphite lg:flex-row', className)}>
      <a href="#admin-main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus() }} className="sr-only z-50 rounded-md bg-burgundy px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>

      <header className="shrink-0 bg-plum text-ivory lg:w-64">
        <div className="lg:sticky lg:top-0">
          <div className="flex items-center justify-between gap-3 px-5 py-4 lg:py-6">
            <div className="flex items-center gap-2.5">
              <img src={GLYPH} alt="" className="size-8 rounded-full bg-ivory p-1" />
              <div className="leading-tight">
                <p className="font-serif text-lg font-semibold">Bodylia</p>
                <p className="text-xs text-ivory/85">Batch console</p>
              </div>
            </div>
            <div className="flex items-center gap-1 lg:hidden">
            <button onClick={() => go('account')} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-ivory hover:bg-white/10">
              <UserCircle className="size-5" aria-hidden="true" />
              <span className="sr-only">My account</span>
            </button>
            <button onClick={() => onSignOut('manual')} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-ivory hover:bg-white/10">
              <LogOut className="size-5" aria-hidden="true" />
              <span className="sr-only">Sign out</span>
            </button>
            </div>
          </div>
          <nav aria-label="Console" className="overflow-x-auto px-3 pb-3 lg:overflow-visible lg:pb-4">
            <div className="flex gap-1 lg:flex-col lg:gap-5">
              {GROUPS.map((g) => {
                const items = g.items.filter((i) => !SECTION_PERMISSION[i.id] || can(user, SECTION_PERMISSION[i.id]!))
                if (items.length === 0) return null
                return (
                  <div key={g.label} className="flex gap-1 lg:flex-col">
                    <p className="hidden px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-ivory/70 lg:block">{g.label}</p>
                    <ul className="flex gap-1 lg:flex-col">
                      {items.map((n) => {
                        const Icon = n.icon
                        const active = section === n.id || (n.id === 'batches' && section === 'import')
                        const count = badge(n.id)
                        return (
                          <li key={n.id}>
                            <button
                              onClick={() => go(n.id)}
                              aria-current={active ? 'page' : undefined}
                              className={cn(
                                'flex min-h-11 w-full items-center gap-3 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-150',
                                active ? 'bg-ivory text-plum' : 'text-ivory hover:bg-white/10',
                              )}
                            >
                              <Icon className="size-4 shrink-0" aria-hidden="true" />
                              {n.label}
                              {count > 0 && (
                                <span className={cn('ml-auto rounded-full px-2 py-0.5 text-xs font-semibold', active ? 'bg-burgundy text-white' : 'bg-ivory text-plum')}>
                                  {count}
                                  <span className="sr-only">{n.id === 'reports' ? ' new' : ' open'}</span>
                                </span>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          </nav>
          <div className="hidden border-t border-white/15 px-5 py-4 lg:block">
            <button onClick={() => go('account')} className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] flex-col items-start justify-center rounded-md px-2 text-left hover:bg-white/10" aria-current={section === 'account' ? 'page' : undefined}>
              <span className="truncate text-sm font-semibold">{user.name}</span>
              <span className="text-xs text-ivory/85">{ROLE_LABEL[user.role]} · My account</span>
            </button>
            <div className="mt-2 flex flex-col gap-1">
              {onExit && (
                <button onClick={onExit} className="-mx-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-ivory hover:bg-white/10">
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Public batch check
                </button>
              )}
              <button onClick={() => onSignOut('manual')} className="-mx-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-ivory hover:bg-white/10">
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 border-b border-mist bg-ivory">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-2 sm:px-8">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex min-h-11 w-full max-w-md items-center gap-2 rounded-md border border-taupe bg-white px-3 text-left text-sm text-muted hover:border-burgundy"
            >
              <Search className="size-4" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">Search batches, reports, staff</span>
              <kbd className="hidden rounded border border-stone px-1.5 font-sans text-xs sm:inline">Ctrl K</kbd>
            </button>
            <NotificationsButton user={user} go={go} />
          </div>
        </div>
        <main id="admin-main" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">
            {!allowed && <NotPermitted section={section} permission={perm!} go={go} />}
            {allowed && section === 'overview' && <OverviewRouter user={user} go={go} />}
            {allowed && section === 'reports' && <ReportsPage user={user} focus={focus.report} go={go} />}
            {allowed && section === 'escalations' && <EscalationsPage user={user} go={go} />}
            {allowed && section === 'batches' && <BatchesPage user={user} focus={focus.batch} go={go} />}
            {allowed && section === 'import' && <BulkImportPage user={user} go={go} />}
            {allowed && section === 'intelligence' && <IntelligencePage go={go} />}
            {allowed && section === 'users' && <UsersPage user={user} />}
            {allowed && section === 'catalogue' && <CataloguePage user={user} />}
            {allowed && section === 'settings' && <SettingsPage user={user} />}
            {allowed && section === 'audit' && <AuditPage user={user} />}
            {section === 'account' && (
              <AccountPage user={user} onSignOut={() => onSignOut('manual')} onPreviewTimeout={() => setPreviewTimeout((n) => n + 1)} />
            )}
          </div>
        </main>
      </div>

      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} user={user} go={go} />
      <SessionTimeout previewTrigger={previewTimeout} onTimeout={() => onSignOut('timeout')} />
    </div>
  )
}
