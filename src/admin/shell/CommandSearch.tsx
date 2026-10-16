import React, { useMemo, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { FileWarning, LayoutDashboard, Package, Search, User } from 'lucide-react'
import type { StaffUser } from '../../data/admin-seed'
import { useStore } from '../../lib/store'
import { can } from '../../lib/auth'
import { getProduct } from '../../lib/products'
import type { Go, Section } from '../AdminShell'
import { SECTION_PERMISSION } from '../AdminShell'
import { cn } from '../../lib/utils'

interface Hit {
  id: string
  group: 'Batches' | 'Reports' | 'Staff' | 'Pages'
  label: string
  hint: string
  run: () => void
}

const PAGES: [Section, string][] = [
  ['overview', 'Overview'], ['reports', 'Reports'], ['escalations', 'Escalations'], ['batches', 'Batches'],
  ['import', 'Bulk import'], ['intelligence', 'Intelligence'], ['users', 'Staff & roles'],
  ['catalogue', 'Catalogue'], ['settings', 'Settings'], ['audit', 'Audit log'], ['account', 'My account'],
]

/** ⌘K command search. Opened from the keyboard, so it appears instantly (no animation). */
export function CommandSearch({ open, onOpenChange, user, go }: { open: boolean; onOpenChange: (o: boolean) => void; user: StaffUser; go: Go }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const batches = useStore((s) => s.batches)
  const reports = useStore((s) => s.reports)
  const users = useStore((s) => s.users)

  const hits = useMemo<Hit[]>(() => {
    const n = q.trim().toLowerCase()
    const close = (fn: () => void) => () => {
      onOpenChange(false)
      setQ('')
      fn()
    }
    const out: Hit[] = []
    PAGES.filter(([s]) => !SECTION_PERMISSION[s] || can(user, SECTION_PERMISSION[s]!))
      .filter(([, l]) => !n || l.toLowerCase().includes(n))
      .slice(0, n ? 4 : 6)
      .forEach(([s, l]) => out.push({ id: `p-${s}`, group: 'Pages', label: l, hint: 'Go to page', run: close(() => go(s)) }))
    if (n) {
      if (can(user, 'batches.view'))
        batches
          .filter((b) => b.batch.toLowerCase().includes(n) || getProduct(b.product).name.toLowerCase().includes(n))
          .slice(0, 5)
          .forEach((b) => out.push({ id: `b-${b.batch}`, group: 'Batches', label: b.batch, hint: getProduct(b.product).name, run: close(() => go('batches', { batch: b.batch })) }))
      if (can(user, 'reports.view'))
        reports
          .filter((r) => r.reference.toLowerCase().includes(n) || r.batch.toLowerCase().includes(n) || r.fullName.toLowerCase().includes(n))
          .slice(0, 5)
          .forEach((r) => out.push({ id: `r-${r.reference}`, group: 'Reports', label: r.reference, hint: `${r.fullName} · ${r.batch}`, run: close(() => go('reports', { report: r.reference })) }))
      if (can(user, 'users.manage'))
        users
          .filter((u) => u.name.toLowerCase().includes(n) || u.email.includes(n))
          .slice(0, 3)
          .forEach((u) => out.push({ id: `u-${u.id}`, group: 'Staff', label: u.name, hint: u.email, run: close(() => go('users')) }))
    }
    return out
  }, [q, batches, reports, users, user, go, onOpenChange])

  const icon = { Batches: Package, Reports: FileWarning, Staff: User, Pages: LayoutDashboard }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQ('') }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-plum/50" />
        <DialogPrimitive.Content aria-describedby={undefined} className="fixed left-1/2 top-[12%] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg bg-white shadow-xl">
          <DialogPrimitive.Title className="sr-only">Search the console</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-mist px-4">
            <Search className="size-5 text-muted" aria-hidden="true" />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="cmd-results"
              aria-activedescendant={hits[active] ? `cmd-${hits[active].id}` : undefined}
              aria-label="Search batches, reports, staff and pages"
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
                if (e.key === 'Enter' && hits[active]) { e.preventDefault(); hits[active].run() }
              }}
              placeholder="Type a batch number, SR- reference or name"
              className="min-h-14 flex-1 bg-transparent text-base text-graphite placeholder:text-muted focus:outline-none"
            />
          </div>
          <ul id="cmd-results" role="listbox" aria-label="Results" className="max-h-96 overflow-y-auto p-2">
            {hits.length === 0 && <li className="px-3 py-6 text-center text-graphite">No matches. Try a full batch number like PE-2610-WL01.</li>}
            {hits.map((h, i) => {
              const Icon = icon[h.group]
              return (
                <li
                  key={h.id}
                  id={`cmd-${h.id}`}
                  role="option"
                  aria-selected={i === active}
                  onClick={h.run}
                  onMouseMove={() => setActive(i)}
                  className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3', i === active ? 'bg-sand' : '')}
                >
                  <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="tabular font-semibold text-graphite">{h.label}</span>
                  <span className="truncate text-sm text-muted">{h.hint}</span>
                  <span className="ml-auto text-xs text-muted">{h.group}</span>
                </li>
              )
            })}
          </ul>
          <p className="border-t border-mist px-4 py-2 text-xs text-muted">↑ ↓ to move · Enter to open · Esc to close</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
