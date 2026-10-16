import React, { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Loader2, LogOut, Plus, Search, X } from 'lucide-react'
import type { StaffUser } from '../data/admin-seed'
import { ROLE_LABEL } from '../data/roles'
import { aliasCode, type BatchRecord } from '../data/batches'
import { apiBase } from '../lib/bff'
import { changePassword, loadSession } from '../lib/auth'
import { normaliseAlias } from '../lib/utils'
import { toast } from '../lib/toast'
import { changePasswordSchema, type ChangePasswordInput } from './schemas'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { FormField } from '../components/ui/form-field'
import { PasswordField } from './access/PasswordField'

/**
 * Production staff console (API-backed). Renders ONLY in production builds —
 * never imports lib/store or data fixtures (those throw at module load in
 * prod, which is exactly what broke #/console before this existed).
 * Endpoints: GET /api/admin/batches?q=, POST/DELETE …/aliases, POST
 * /api/auth/password — all same-origin via host nginx, Bearer JWT session.
 */
class AuthExpired extends Error {
  constructor() {
    super('Session expired — sign in again.')
  }
}

async function adminApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const session = loadSession()
  const res = await fetch(`${apiBase()}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  if (res.status === 401) throw new AuthExpired()
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
  return data as T
}

type Tab = 'batches' | 'account'

export function ProdShell({
  user,
  onExit,
  onSignOut,
  className,
}: {
  user: StaffUser
  onExit?: () => void
  onSignOut: (reason: 'manual' | 'timeout') => void
  className?: string
}) {
  const [tab, setTab] = useState<Tab>('batches')
  const [batches, setBatches] = useState<BatchRecord[] | null>(null)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [listError, setListError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(
    async (query: string) => {
      setListError(null)
      try {
        setBatches(await adminApi<BatchRecord[]>(`/api/admin/batches?q=${encodeURIComponent(query)}`))
      } catch (e) {
        if (e instanceof AuthExpired) return onSignOut('timeout')
        setListError((e as Error).message)
        setBatches([])
      }
    },
    [onSignOut],
  )

  useEffect(() => {
    void load(search)
  }, [load, search])

  const mutate = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setListError(null)
    try {
      await fn()
      await load(search)
    } catch (e) {
      if (e instanceof AuthExpired) return onSignOut('timeout')
      setListError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const addAlias = (batch: BatchRecord, raw: string) =>
    mutate(`${batch.batch}:add`, async () => {
      const norm = normaliseAlias(raw)
      if (!norm) throw new Error('Enter a vendor code (at least 3 characters).')
      const codes = (batch.aliases ?? []).map(aliasCode)
      if (codes.includes(norm)) throw new Error(`"${norm}" is already mapped to ${batch.batch}.`)
      await adminApi(`/api/admin/batches/${encodeURIComponent(batch.batch)}/aliases`, {
        method: 'POST',
        body: { alias: norm },
      })
      toast(`${norm} mapped`, { description: `Customers can now verify ${batch.batch} with this code.` })
      setQ('')
    })

  const removeAlias = (batch: BatchRecord, code: string) =>
    mutate(`${batch.batch}:${code}`, () =>
      adminApi(`/api/admin/batches/${encodeURIComponent(batch.batch)}/aliases/${encodeURIComponent(code)}`, {
        method: 'DELETE',
      }),
    )

  return (
    <div className={className}>
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-mist pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Bodylia staff</p>
            <h1 className="font-serif text-3xl font-semibold text-graphite">Staff console</h1>
            <p className="mt-1 text-sm text-muted">
              {user.name} · <span className="font-semibold text-graphite">{ROLE_LABEL[user.role]}</span>
            </p>
          </div>
          <div className="flex gap-3">
            {onExit && <Button variant="outline" onClick={onExit}>Back to batch check</Button>}
            <Button variant="outline" onClick={() => onSignOut('manual')}>
              <LogOut aria-hidden="true" className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>

        <nav className="mt-6 flex gap-2" aria-label="Console sections">
          {(['batches', 'account'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={tab === t ? 'page' : undefined}
              className={`min-h-11 rounded-md px-4 text-sm font-semibold transition-colors ${tab === t ? 'bg-graphite text-sand' : 'text-graphite hover:bg-sand'}`}
            >
              {t === 'batches' ? 'Batches & aliases' : 'My account'}
            </button>
          ))}
        </nav>
        {tab === 'batches' && (
          <section aria-label="Batches and aliases" className="mt-6">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                setSearch(q.trim())
              }}
            >
              <FormField id="batch-q" label="Search batches (canonical code or vendor code)" className="min-w-72 flex-1">
                {(a) => <Input {...a} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. FR-2610-WL01 or 2K26005" />}
              </FormField>
              <Button type="submit" variant="outline">
                <Search aria-hidden="true" className="mr-2 h-4 w-4" /> Search
              </Button>
            </form>

            {listError && (
              <p role="alert" className="mt-4 rounded-md border-2 border-error bg-error-bg p-3 text-sm text-error">{listError}</p>
            )}
            {batches === null && (
              <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted">
                <Loader2 className="animate-spin" aria-hidden="true" /> Loading batches…
              </p>
            )}
            {batches !== null && batches.length === 0 && (
              <p className="mt-6 text-sm text-muted">No batches match “{search}”.</p>
            )}
            <ul className="mt-6 flex flex-col gap-4">
              {(batches ?? []).map((b) => (
                <li key={b.batch} className="rounded-lg border border-mist bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="tabular font-semibold text-graphite">{b.batch}</span>
                      <span className="text-sm text-muted">{b.product}</span>
                      <span className="text-sm text-muted">expires {b.expires}</span>
                    </div>
                    <span className={b.status === 'recalled' ? 'text-sm font-semibold text-error' : 'text-sm font-semibold text-leaf'}>
                      {b.status === 'recalled' ? 'Recalled' : 'Released'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">Vendor codes</span>
                    {(b.aliases ?? []).map((a) => {
                      const code = aliasCode(a)
                      return (
                        <span
                          key={code}
                          className="tabular inline-flex items-center gap-1 rounded-full border border-stone px-2.5 py-0.5 text-xs text-graphite"
                        >
                          {code}
                          <button
                            type="button"
                            aria-label={`Remove alias ${code}`}
                            disabled={busy === `${b.batch}:${code}`}
                            onClick={() => void removeAlias(b, code)}
                            className="text-muted transition-colors hover:text-error disabled:opacity-50"
                          >
                            <X aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      )
                    })}
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        const input = (e.currentTarget.elements.namedItem('alias') as HTMLInputElement).value
                        void addAlias(b, input)
                      }}
                    >
                      <Input
                        name="alias"
                        aria-label={`Add vendor code to ${b.batch}`}
                        placeholder="NEW-CODE"
                        className="h-9 w-40 text-sm"
                      />
                      <Button type="submit" size="sm" disabled={busy === `${b.batch}:add`} aria-label={`Map code to ${b.batch}`}>
                        {busy === `${b.batch}:add` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tab === 'account' && (
          <section aria-label="My account" className="mt-6 max-w-2xl">
            <h2 className="font-serif text-2xl font-semibold text-graphite">My account</h2>
            <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted">Name</dt>
              <dd className="font-medium text-graphite">{user.name}</dd>
              <dt className="text-muted">Work email</dt>
              <dd className="font-medium text-graphite">{user.email}</dd>
              <dt className="text-muted">Role</dt>
              <dd className="font-medium text-graphite">{ROLE_LABEL[user.role]}</dd>
            </dl>

            <h3 className="mt-8 flex items-center gap-2 font-semibold text-graphite">
              <KeyRound aria-hidden="true" className="h-4 w-4 text-burgundy" /> Change password
            </h3>
            <PasswordForm
              onExpired={() => onSignOut('timeout')}
              onDone={(msg: string) => toast(msg)}
            />
          </section>
        )}
      </div>
    </div>
  )
}

/** Change-password form — POST /api/auth/password; server enforces the policy. */
function PasswordForm({ onExpired, onDone }: { onExpired: () => void; onDone: (msg: string) => void }) {
  const [done, setDone] = useState(false)
  const pw = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: '', password: '', confirm: '' },
  })
  const submit = pw.handleSubmit(async (v) => {
    setDone(false)
    try {
      await changePassword(v.current, v.password)
      pw.reset()
      setDone(true)
      onDone('Password changed')
    } catch (e) {
      const err = e as Error
      if (err.message.includes('Session expired')) return onExpired()
      pw.setError('current', { message: err.message })
    }
  })
  return (
    <form noValidate onSubmit={submit} className="mt-4 flex flex-col gap-5">
      <FormField id="ac-current" label="Current password" error={pw.formState.errors.current?.message}>
        {(a) => <PasswordField {...a} {...pw.register('current')} autoComplete="current-password" />}
      </FormField>
      <FormField
        id="ac-new"
        label="New password"
        description="12+ characters with upper and lower case, a number and a symbol."
        error={pw.formState.errors.password?.message}
      >
        {(a) => <PasswordField {...a} {...pw.register('password')} autoComplete="new-password" />}
      </FormField>
      <FormField id="ac-confirm" label="Confirm new password" error={pw.formState.errors.confirm?.message}>
        {(a) => <PasswordField {...a} {...pw.register('confirm')} autoComplete="new-password" />}
      </FormField>
      {done && (
        <p role="status" className="text-sm font-medium text-leaf">
          Password changed. Use the new password the next time you sign in.
        </p>
      )}
      <Button type="submit" className="self-start" disabled={pw.formState.isSubmitting}>
        {pw.formState.isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Change password
      </Button>
    </form>
  )
}