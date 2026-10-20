import React, { useState } from 'react'
import { Search } from 'lucide-react'
import { PageHeader } from '../PageHeader'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { ProdError, ProdLoading, useAdminQuery, whenLabel } from './shared'

/**
 * Production Audit log tab (API-backed). GET /api/admin/audit?target=&limit=
 * — newest first, capped at 200 events, filterable by target (batch, staff
 * id, report reference or 'console').
 */

interface AuditEvent {
  at: string
  actor: string
  action: string
  target: string
  detail?: string
}

export function ProdAuditPage({ onSignOut }: { onSignOut: () => void }) {
  const [target, setTarget] = useState('')
  const [committed, setCommitted] = useState('')
  const { data, error, loading } = useAdminQuery<AuditEvent[]>(
    `/api/admin/audit?limit=200${committed ? `&target=${encodeURIComponent(committed)}` : ''}`,
    onSignOut,
  )

  return (
    <div className="mt-6">
      <PageHeader
        title="Audit log"
        description="Every staff, batch, alias, report, settings and catalogue mutation — newest first, last 200 events."
      />

      <form
        className="mt-6 flex max-w-xl items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setCommitted(target.trim())
        }}
      >
        <FormField id="audit-target" label="Filter by target" className="flex-1">
          {(a) => (
            <Input
              {...a}
              type="search"
              placeholder="Batch number, staff id, report reference…"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          )}
        </FormField>
        <Button type="submit" variant="outline" className="shrink-0">
          <Search className="mr-1.5 size-4" aria-hidden="true" /> Filter
        </Button>
      </form>

      {error && (
        <div className="mt-4">
          <ProdError message={error} />
        </div>
      )}
      {loading && (
        <div className="mt-4">
          <ProdLoading label="Loading audit events…" />
        </div>
      )}

      {data && !loading && (
        <div role="region" aria-label="Audit events (scrolls sideways on small screens)" tabIndex={0} className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Audit events, newest first</caption>
            <thead>
              <tr className="border-b border-gold text-muted">
                <th scope="col" className="py-2.5 pr-4 font-medium">When</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Who</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Action</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Target</th>
                <th scope="col" className="py-2.5 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e, i) => (
                <tr key={`${e.at}-${i}`} className="border-b border-mist align-top">
                  <td className="tabular py-2.5 pr-4 whitespace-nowrap text-graphite">{whenLabel(e.at)}</td>
                  <td className="py-2.5 pr-4 text-graphite">{e.actor}</td>
                  <td className="py-2.5 pr-4 font-medium text-graphite">{e.action}</td>
                  <td className="tabular py-2.5 pr-4 text-graphite">{e.target}</td>
                  <td className="py-2.5 text-graphite">{e.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.length === 0 && (
            <p className="mt-4 text-graphite">
              {committed ? `No events for “${committed}”.` : 'No audit events recorded yet.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
