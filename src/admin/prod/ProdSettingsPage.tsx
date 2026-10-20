import React, { useEffect, useState } from 'react'
import type { StaffUser } from '../../data/admin-seed'
import { Loader2 } from 'lucide-react'
import { adminApi } from '../admin-api'
import { toast } from '../../lib/toast'
import { PageHeader } from '../PageHeader'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { ProdError, ProdLoading, useAdminQuery, useProdActions, whenLabel } from './shared'

/**
 * Production Settings tab (API-backed). GET/PATCH /api/admin/settings — the
 * singleton console row (rate limit, reply target, retention, session TTL,
 * support inbox). PATCH is admin-only server-side; ranges are mirrored from
 * backend-go/handlers_admin_misc.go so mistakes surface before the round trip.
 */

interface AdminSettings {
  rateLimitPerMinute: number
  replyTargetHours: number
  supportEmail: string
  retentionMonths: number
  sessionMinutes: number
  updatedAt: string
}

type FormState = {
  rateLimitPerMinute: string
  replyTargetHours: string
  supportEmail: string
  retentionMonths: string
  sessionMinutes: string
}

const RANGES: Record<keyof Omit<FormState, 'supportEmail'>, [number, number]> = {
  rateLimitPerMinute: [1, 1000],
  replyTargetHours: [1, 720],
  retentionMonths: [1, 120],
  sessionMinutes: [5, 480],
}

export function ProdSettingsPage({ user, onSignOut }: { user: StaffUser; onSignOut: () => void }) {
  const isAdmin = user.role === 'admin'
  const { data, error, loading, reload } = useAdminQuery<AdminSettings>('/api/admin/settings', onSignOut)
  const { busy, run } = useProdActions(onSignOut)
  const [form, setForm] = useState<FormState | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  useEffect(() => {
    if (!data) return
    setForm({
      rateLimitPerMinute: String(data.rateLimitPerMinute),
      replyTargetHours: String(data.replyTargetHours),
      supportEmail: data.supportEmail,
      retentionMonths: String(data.retentionMonths),
      sessionMinutes: String(data.sessionMinutes),
    })
    setFieldErrors({})
  }, [data])

  if (error) {
    return (
      <div className="mt-6">
        <PageHeader title="Settings" description="Console-wide targets, limits and retention." />
        <div className="mt-6">
          <ProdError message={error} />
        </div>
      </div>
    )
  }
  if (loading || !data || !form) {
    return (
      <div className="mt-6">
        <PageHeader title="Settings" description="Console-wide targets, limits and retention." />
        <div className="mt-6">
          <ProdLoading label="Loading settings…" />
        </div>
      </div>
    )
  }

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {}
    for (const [key, [min, max]] of Object.entries(RANGES) as [keyof typeof RANGES, [number, number]][]) {
      const n = Number(form[key])
      if (!Number.isInteger(n) || n < min || n > max) {
        errs[key] = `Enter a whole number between ${min} and ${max}.`
      }
    }
    const email = form.supportEmail.trim()
    if (!email.includes('@') || email.length > 120) errs.supportEmail = 'Enter a valid support email.'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    const ok = await run('settings', async () => {
      await adminApi('/api/admin/settings', {
        method: 'PATCH',
        body: {
          rateLimitPerMinute: Number(form.rateLimitPerMinute),
          replyTargetHours: Number(form.replyTargetHours),
          supportEmail: form.supportEmail.trim(),
          retentionMonths: Number(form.retentionMonths),
          sessionMinutes: Number(form.sessionMinutes),
        },
      })
    })
    if (ok) {
      toast('Settings saved')
      reload()
    }
  }

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [key]: e.target.value } : f))

  return (
    <div className="mt-6">
      <PageHeader
        title="Settings"
        description="Console-wide targets, limits and retention — every change is written to the audit log."
      />
      {!isAdmin && (
        <p className="mt-4 rounded-md border border-mist bg-sand p-3 text-sm text-graphite">
          You can review the settings here — only admins can change them.
        </p>
      )}

      <form onSubmit={save} className="mt-6 flex max-w-2xl flex-col gap-5" aria-busy={busy === 'settings'}>
        <FormField
          id="set-reply"
          label="Reply target (hours)"
          description="Open reports should be first answered within this window (1–720 hours)."
          error={fieldErrors.replyTargetHours}
        >
          {(a) => <Input {...a} type="number" inputMode="numeric" min={1} max={720} value={form.replyTargetHours} onChange={set('replyTargetHours')} disabled={!isAdmin} />}
        </FormField>
        <FormField
          id="set-rate"
          label="Public lookup rate limit (per minute)"
          description="Checks allowed per minute per visitor before the human check kicks in (1–1000)."
          error={fieldErrors.rateLimitPerMinute}
        >
          {(a) => <Input {...a} type="number" inputMode="numeric" min={1} max={1000} value={form.rateLimitPerMinute} onChange={set('rateLimitPerMinute')} disabled={!isAdmin} />}
        </FormField>
        <FormField
          id="set-retention"
          label="Report retention (months)"
          description="How long customer reports are kept before deletion (1–120 months)."
          error={fieldErrors.retentionMonths}
        >
          {(a) => <Input {...a} type="number" inputMode="numeric" min={1} max={120} value={form.retentionMonths} onChange={set('retentionMonths')} disabled={!isAdmin} />}
        </FormField>
        <FormField
          id="set-session"
          label="Staff session (minutes)"
          description="Idle minutes before a console session expires (5–480 minutes)."
          error={fieldErrors.sessionMinutes}
        >
          {(a) => <Input {...a} type="number" inputMode="numeric" min={5} max={480} value={form.sessionMinutes} onChange={set('sessionMinutes')} disabled={!isAdmin} />}
        </FormField>
        <FormField
          id="set-support"
          label="Support inbox"
          description="Replies to customers are sent from this address (max 120 characters)."
          error={fieldErrors.supportEmail}
        >
          {(a) => <Input {...a} type="email" value={form.supportEmail} onChange={set('supportEmail')} disabled={!isAdmin} />}
        </FormField>

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={!isAdmin || busy === 'settings'}>
            {busy === 'settings' ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Save settings
          </Button>
          <span className="text-xs text-muted">Last change: {whenLabel(data.updatedAt)}</span>
        </div>
      </form>
    </div>
  )
}

