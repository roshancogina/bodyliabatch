import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { adminApi } from '../admin-api'
import { toast } from '../../lib/toast'
import { PageHeader } from '../PageHeader'
import { Button } from '../../components/ui/button'
import { NativeSelect } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { Badge } from '../../components/ui/badge'
import { ProdError, ProdLoading, useAdminQuery, useProdActions, whenLabel } from './shared'

/**
 * Production Escalations tab (API-backed). GET /api/admin/escalations?state=,
 * handle via PATCH /api/admin/escalations/:ref { state: accepted|returned } —
 * only open escalations can be handled (409 otherwise), audited server-side.
 */

interface Escalation {
  reference: string
  by: string
  at: string
  reason: string
  urgency: 'standard' | 'urgent'
  state: 'open' | 'accepted' | 'returned'
  handledBy?: string
}

const STATE_FILTERS = [
  { value: 'open', label: 'Open queue' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'returned', label: 'Returned' },
  { value: 'all', label: 'All' },
]

export function ProdEscalationsPage({ onSignOut }: { onSignOut: () => void }) {
  const [state, setState] = useState('open')
  const { busy, run } = useProdActions(onSignOut)
  const list = useAdminQuery<Escalation[]>(`/api/admin/escalations?state=${encodeURIComponent(state)}`, onSignOut)

  const handle = async (ref: string, next: 'accepted' | 'returned') => {
    const ok = await run(`${next}:${ref}`, async () => {
      await adminApi(`/api/admin/escalations/${encodeURIComponent(ref)}`, {
        method: 'PATCH',
        body: { state: next },
      })
    })
    if (ok) {
      toast(next === 'accepted' ? `Escalation ${ref} accepted` : `Escalation ${ref} returned`)
      list.reload()
    }
  }

  return (
    <div className="mt-6">
      <PageHeader
        title="Escalations"
        description="Reports flagged for quality — accept to take ownership, or return to support with context."
      />

      <div className="mt-6 sm:w-64">
        <FormField id="esc-state" label="Show">
          {(a) => (
            <NativeSelect {...a} value={state} onChange={(e) => setState(e.target.value)}>
              {STATE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>

      {list.error && (
        <div className="mt-4">
          <ProdError message={list.error} />
        </div>
      )}
      {list.loading && (
        <div className="mt-4">
          <ProdLoading label="Loading escalations…" />
        </div>
      )}

      {list.data && !list.loading && (
        <ul className="mt-6 flex flex-col gap-4">
          {list.data.map((e) => (
            <li key={e.reference} className="rounded-lg border-2 border-mist p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="tabular font-semibold text-graphite">{e.reference}</span>
                    <Badge tone={e.urgency === 'urgent' ? 'error' : 'neutral'}>
                      {e.urgency === 'urgent' ? 'Urgent' : 'Standard'}
                    </Badge>
                    <Badge tone={e.state === 'open' ? 'warning' : e.state === 'accepted' ? 'info' : 'neutral'}>
                      {e.state === 'open' ? 'Open' : e.state === 'accepted' ? 'Accepted' : 'Returned'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-graphite">{e.reason}</p>
                  <p className="mt-2 text-xs text-muted">
                    Raised by {e.by} · {whenLabel(e.at)}
                    {e.handledBy ? ` · handled by ${e.handledBy}` : ''}
                  </p>
                </div>
                {e.state === 'open' && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      onClick={() => handle(e.reference, 'accepted')}
                      disabled={busy !== null}
                      aria-label={`Accept escalation ${e.reference}`}
                    >
                      {busy === `accepted:${e.reference}` ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handle(e.reference, 'returned')}
                      disabled={busy !== null}
                      aria-label={`Return escalation ${e.reference}`}
                    >
                      {busy === `returned:${e.reference}` ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                      Return
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
          {list.data.length === 0 && <p className="text-graphite">Nothing in this queue.</p>}
        </ul>
      )}
    </div>
  )
}
