import React, { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Search, UserPlus } from 'lucide-react'
import { STATUS_LABEL, type ReportStatus, type StaffUser } from '../data/admin-seed'
import { store, useStore } from '../lib/store'
import { can } from '../lib/auth'
import { toast } from '../lib/toast'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Input, NativeSelect } from '../components/ui/input'
import { PageHeader } from './PageHeader'
import { ReportStatusBadge } from './ReportStatusBadge'
import { ReportDetailSheet } from './ReportDetailSheet'
import { DueLabel, hoursLeft } from './overview/parts'
import type { Go } from './AdminShell'

type Filter = 'open' | ReportStatus | 'all'
const FILTERS: Filter[] = ['open', 'new', 'investigating', 'resolved_genuine', 'resolved_counterfeit', 'all']
const FILTER_LABEL: Record<Filter, string> = { open: 'Open', all: 'All', ...STATUS_LABEL }

export function ReportsPage({ user, focus, go }: { user: StaffUser; focus?: string; go: Go }) {
  const reports = useStore((s) => s.reports)
  const batches = useStore((s) => s.batches)
  const users = useStore((s) => s.users)
  const target = useStore((s) => s.settings.replyTargetHours)
  const [filter, setFilter] = useState<Filter>('open')
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('anyone')
  const [openRef, setOpenRef] = useState<string | null>(focus ?? null)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkTo, setBulkTo] = useState('')

  useEffect(() => setOpenRef(focus ?? null), [focus])

  const assignable = users.filter((u) => u.status === 'active' && u.role !== 'admin')
  const match = (status: ReportStatus, f: Filter) => f === 'all' || (f === 'open' ? status === 'new' || status === 'investigating' : status === f)

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return reports
      .filter((r) => match(r.status, filter))
      .filter((r) => owner === 'anyone' || (owner === 'unassigned' ? !r.assignee : r.assignee === owner))
      .filter((r) => !n || [r.reference, r.batch, r.fullName, r.email, r.message].some((f) => f.toLowerCase().includes(n)))
      .sort((a, b) => (filter === 'open' ? hoursLeft(a, target) - hoursLeft(b, target) : b.createdAt.localeCompare(a.createdAt)))
  }, [reports, filter, owner, q, target])

  const report = reports.find((r) => r.reference === openRef) ?? null
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.reference))

  const bulkAssign = () => {
    if (!bulkTo) return
    selected.forEach((ref) => {
      store.updateReport(ref, { assignee: bulkTo, status: 'investigating' }, { by: user.name, kind: 'assign', text: `Assigned to ${bulkTo}` })
      store.audit(user.name, 'Assigned report', ref, bulkTo)
    })
    toast(`${selected.length} report${selected.length > 1 ? 's' : ''} assigned to ${bulkTo}`)
    setSelected([])
    setBulkTo('')
  }

  return (
    <div>
      <PageHeader
        title="Suspicious-pack reports"
        description={`Sent by customers from the public batch check. Reply target: ${target} hours from receipt.`}
      />

      <div className="mt-6 overflow-x-auto">
        <ul className="flex gap-1 border-b border-mist" aria-label="Filter by status">
          {FILTERS.map((f) => {
            const count = reports.filter((r) => match(r.status, f)).length
            const active = filter === f
            return (
              <li key={f}>
                <button
                  onClick={() => { setFilter(f); setSelected([]) }}
                  aria-pressed={active}
                  className={cn(
                    '-mb-px inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors duration-150',
                    active ? 'border-burgundy text-burgundy' : 'border-transparent text-muted hover:text-graphite',
                  )}
                >
                  {FILTER_LABEL[f]}
                  <span className="tabular text-xs">{count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div role="search" className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rp-q" className="text-sm font-semibold">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input id="rp-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, batch, customer or words in the message" className="pl-9" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rp-owner" className="text-sm font-semibold">Owner</label>
          <NativeSelect id="rp-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="anyone">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {assignable.map((u) => <option key={u.id} value={u.name}>{u.name}{u.name === user.name ? ' (you)' : ''}</option>)}
          </NativeSelect>
        </div>
      </div>

      {can(user, 'reports.update') && selected.length > 0 && (
        <div className="mt-5 flex flex-col gap-3 rounded-md bg-sand p-4 sm:flex-row sm:items-end">
          <p className="font-semibold text-graphite sm:mb-3" aria-live="polite">{selected.length} selected</p>
          <div className="flex flex-1 flex-col gap-1.5 sm:max-w-xs">
            <label htmlFor="bulk-to" className="text-sm font-semibold">Assign to</label>
            <NativeSelect id="bulk-to" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)}>
              <option value="">Choose a person</option>
              {assignable.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
            </NativeSelect>
          </div>
          <Button onClick={bulkAssign} disabled={!bulkTo}>
            <UserPlus aria-hidden="true" />
            Assign selected
          </Button>
          <Button variant="ghost" onClick={() => setSelected([])}>Clear selection</Button>
        </div>
      )}

      <p className="mt-5 text-sm text-muted" aria-live="polite">{rows.length} {rows.length === 1 ? 'report' : 'reports'}</p>
      {rows.length === 0 ? (
        <p className="py-12 text-center text-graphite">No reports match. Try “All” or clear the search.</p>
      ) : (
        <div role="region" aria-label="Reports (scrolls sideways on small screens)" tabIndex={0} className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Reports</caption>
            <thead>
              <tr className="border-b border-gold text-muted">
                <th scope="col" className="w-10 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all reports shown"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : rows.map((r) => r.reference))}
                    className="size-6 accent-[#4a1f33]"
                  />
                </th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Reference</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Batch & message</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Owner</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Time to target</th>
                <th scope="col" className="py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const known = batches.some((b) => b.batch === r.batch)
                const isOpen = r.status === 'new' || r.status === 'investigating'
                return (
                  <tr key={r.reference} className="border-b border-mist align-top">
                    <td className="py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.reference}`}
                        checked={selected.includes(r.reference)}
                        onChange={() => setSelected((s) => (s.includes(r.reference) ? s.filter((x) => x !== r.reference) : [...s, r.reference]))}
                        className="size-6 accent-[#4a1f33]"
                      />
                    </td>
                    <th scope="row" className="py-1 pr-4 font-semibold">
                      <button onClick={() => setOpenRef(r.reference)} className="tabular inline-flex min-h-11 items-center text-burgundy underline decoration-1 underline-offset-4 hover:decoration-2">
                        {r.reference}
                      </button>
                      <span className="block text-xs font-normal text-muted">{format(new Date(r.createdAt), 'd MMM, HH:mm')}</span>
                    </th>
                    <td className="max-w-md py-3 pr-4">
                      <span className="tabular font-semibold text-graphite">{r.batch}</span>
                      {!known && <span className="ml-1.5 font-medium text-error">· unregistered</span>}
                      <span className="mt-0.5 line-clamp-1 block text-graphite/90">{r.message}</span>
                    </td>
                    <td className="py-3 pr-4 text-graphite">{r.assignee ?? <span className="text-muted">Unassigned</span>}</td>
                    <td className="py-3 pr-4">{isOpen ? <DueLabel hours={hoursLeft(r, target)} /> : <span className="text-muted">—</span>}</td>
                    <td className="py-3">
                      <ReportStatusBadge status={r.status} />
                      {r.escalation?.state === 'open' && <span className="mt-1 block text-xs font-medium text-info">Escalated</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ReportDetailSheet user={user} report={report} onClose={() => setOpenRef(null)} go={go} />
    </div>
  )
}
