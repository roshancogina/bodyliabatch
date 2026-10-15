import React, { useEffect, useRef, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Bell } from 'lucide-react'
import type { StaffUser } from '../../data/admin-seed'
import { store, useStore } from '../../lib/store'
import { cn } from '../../lib/utils'
import type { Go } from '../AdminShell'

export function NotificationsButton({ user, go }: { user: StaffUser; go: Go }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const all = useStore((s) => s.notifications)
  const mine = all.filter((n) => n.roles.includes(user.role))
  const unread = mine.filter((n) => !n.read).length

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const markAll = () => store.set((s) => ({ notifications: s.notifications.map((n) => (n.roles.includes(user.role) ? { ...n, read: true } : n)) }))
  const openOne = (id: string, text: string) => {
    store.set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }))
    setOpen(false)
    const ref = text.match(/SR-\d{4}-\d{5}/)?.[0]
    if (ref) go(text.startsWith('Urgent escalation') && user.role !== 'support' ? 'escalations' : 'reports', { report: ref })
    else if (/accreditation/i.test(text)) go(user.role === 'admin' ? 'catalogue' : 'overview')
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="notif-panel"
        className="relative inline-flex size-11 items-center justify-center rounded-md text-graphite hover:bg-sand"
      >
        <Bell className="size-5" aria-hidden="true" />
        <span className="sr-only">Notifications{unread ? `, ${unread} unread` : ''}</span>
        {unread > 0 && (
          <span aria-hidden="true" className="tabular absolute right-1 top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-burgundy px-1 text-xs font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div id="notif-panel" role="region" aria-label="Notifications" className="absolute right-0 top-12 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-lg bg-white shadow-xl ring-1 ring-mist">
          <div className="flex items-center justify-between border-b border-mist px-4 py-2">
            <p className="font-semibold text-graphite">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="inline-flex min-h-11 items-center text-sm font-semibold text-burgundy underline underline-offset-4">
                Mark all read
              </button>
            )}
          </div>
          {mine.length === 0 ? (
            <p className="px-4 py-6 text-center text-graphite">You’re all caught up.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-mist overflow-y-auto">
              {mine.map((n) => (
                <li key={n.id}>
                  <button onClick={() => openOne(n.id, n.text)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-sand">
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-burgundy')} aria-hidden="true" />
                    <span>
                      <span className={cn('block text-sm', n.read ? 'text-graphite' : 'font-semibold text-graphite')}>
                        {n.text}
                        {!n.read && <span className="sr-only"> (unread)</span>}
                      </span>
                      <span className="text-xs text-muted">{formatDistanceToNowStrict(new Date(n.at))} ago</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
