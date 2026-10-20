import React, { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { adminApi, AuthExpired } from '../admin-api'
import { toast } from '../../lib/toast'

/**
 * Shared building blocks for the API-backed Prod console pages (reports,
 * escalations, intelligence, catalogue, settings, audit). Prod-safe by
 * construction: admin-api + lib/toast + UI components only — never lib/store
 * or src/data fixtures (those assert at module load in production builds).
 * The preview console reads STATUS_LABEL from data/admin-seed, so the label
 * vocabulary is re-declared here.
 */

export const REPORT_STATUS_LABEL: Record<string, string> = {
  new: 'New',
  investigating: 'Investigating',
  resolved_genuine: 'Resolved — genuine',
  resolved_counterfeit: 'Resolved — counterfeit',
}

const STATUS_TONE = {
  new: 'brand',
  investigating: 'info',
  resolved_genuine: 'success',
  resolved_counterfeit: 'error',
} as const

export function ProdStatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status as keyof typeof STATUS_TONE] ?? 'neutral'}>{REPORT_STATUS_LABEL[status] ?? status}</Badge>
}

/** '2026-10-19 07:12' style local timestamp for audit/report rows. */
export function whenLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return format(d, 'd MMM yyyy, HH:mm')
}

export function ProdError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md border-2 border-error bg-error-bg p-3 text-sm text-error">
      {message}
    </p>
  )
}

export function ProdLoading({ label }: { label: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="animate-spin" aria-hidden="true" /> {label}
    </p>
  )
}

/**
 * GET an admin endpoint. Re-fetches when `path` changes or reload() is called;
 * a `null` path skips the fetch (nothing selected yet). AuthExpired is
 * forwarded so the shell can end the session.
 */
export function useAdminQuery<T>(path: string | null, onExpired: () => void) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(path !== null)
  const [tick, setTick] = useState(0)
  // Keep the latest callback without re-fetching (parents pass inline arrows).
  const expiredRef = useRef(onExpired)
  expiredRef.current = onExpired

  useEffect(() => {
    if (path === null) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    adminApi<T>(path)
      .then((d) => {
        if (alive) {
          setData(d)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!alive) return
        if (e instanceof AuthExpired) return expiredRef.current()
        setError((e as Error).message)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [path, tick])

  const reload = useCallback(() => setTick((n) => n + 1), [])
  return { data, error, loading, reload }
}

/**
 * Run a mutation with a per-action busy key. Failures surface as an error
 * toast; an expired session signs the staff member out.
 */
export function useProdActions(onExpired: () => void) {
  const [busy, setBusy] = useState<string | null>(null)
  const expiredRef = useRef(onExpired)
  expiredRef.current = onExpired

  const run = useCallback(async (key: string, fn: () => Promise<void>): Promise<boolean> => {
    setBusy(key)
    try {
      await fn()
      return true
    } catch (e) {
      if (e instanceof AuthExpired) {
        expiredRef.current()
        return false
      }
      toast((e as Error).message, { tone: 'error' })
      return false
    } finally {
      setBusy(null)
    }
  }, [])

  return { busy, run }
}
