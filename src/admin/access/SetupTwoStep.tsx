import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Download } from 'lucide-react'
import type { StaffUser } from '../../data/admin-seed'
import { completeMfaSetup, PREVIEW_TOTP } from '../../lib/auth'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { Checkbox } from '../../components/ui/checkbox'
import { twoStepSchema } from '../schemas'
import { assertMockAllowed, PREVIEW_AUTH_ENABLED } from '../../lib/runtime-env'
import { AuthLayout } from './AuthLayout'
import type { AccessStep } from '../AdminApp'

const SECRET = 'JBSW Y3DP EHPK 3PXP'
/** Mock recovery codes — dev/test only. Production issues real codes server-side. */
const RECOVERY: string[] = (() => {
  assertMockAllowed('mock recovery codes')
  return ['BDLRC-7Q4M-9X2K', 'BDLRC-3H8T-1ZQA', 'BDLRC-K2P9-6WVD', 'BDLRC-R5N1-8CJE', 'BDLRC-X7F4-2LMB', 'BDLRC-9DQ6-T3YH']
})()

export function SetupTwoStep({ user, go, className }: { user: StaffUser; go: (s: AccessStep) => void; className?: string }) {
  const [phase, setPhase] = useState<'scan' | 'codes'>('scan')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ code: string }>({ resolver: zodResolver(twoStepSchema), defaultValues: { code: '' } })

  if (phase === 'codes')
    return (
      <AuthLayout className={className} title="Save your recovery codes" lead="Step 2 of 2 · If you lose your phone, each code lets you sign in once.">
        <ul className="tabular grid grid-cols-2 gap-2 rounded-md bg-ivory p-4 text-center font-semibold text-graphite ring-1 ring-mist">
          {RECOVERY.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`Bodylia batch console recovery codes for ${user.email}\n\n${RECOVERY.join('\n')}\n`], { type: 'text/plain' }))
            const a = document.createElement('a')
            a.href = url
            a.download = 'bodylia-recovery-codes.txt'
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          <Download aria-hidden="true" />
          Download codes
        </Button>
        <div className="mt-5 flex items-start gap-3">
          <Checkbox id="saved" checked={saved} onCheckedChange={(v) => setSaved(v === true)} className="mt-0.5" />
          <label htmlFor="saved" className="text-graphite">I’ve stored these codes somewhere safe, away from my phone.</label>
        </div>
        <Button size="lg" className="mt-6 w-full" disabled={!saved} onClick={() => go({ step: 'shell', user: completeMfaSetup(user) })}>
          Finish and open the console
        </Button>
        {!saved && <p className="mt-2 text-center text-sm text-muted">Tick the box above to continue.</p>}
      </AuthLayout>
    )

  return (
    <AuthLayout
      className={className}
      title="Connect your authenticator app"
      lead="Step 2 of 2 · Use Google Authenticator, Microsoft Authenticator or 1Password."
    >
      <ol className="flex flex-col gap-5 text-graphite">
        <li>
          <p className="font-semibold">1. Scan this QR code</p>
          <div className="mt-2 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <FakeQr />
            <div className="text-sm">
              <p className="text-muted">Can’t scan? Enter this key manually:</p>
              <p className="tabular mt-1 font-semibold tracking-wider">{SECRET}</p>
            </div>
          </div>
        </li>
        <li>
          <p className="font-semibold">2. Enter the 6-digit code it shows</p>
          {error && <p role="alert" className="mt-2 text-sm font-medium text-error">{error}</p>}
          <form
            noValidate
            className="mt-2 flex flex-col gap-4"
            onSubmit={handleSubmit(({ code }) => {
              if (code.replace(/\s/g, '') !== PREVIEW_TOTP) return setError('That code didn’t match. Check your phone’s clock is set automatically, then try the newest code.')
              setPhase('codes')
            })}
          >
            <FormField id="setup-code" label="Code from your app" description={PREVIEW_AUTH_ENABLED ? `Preview code: ${PREVIEW_TOTP}` : 'Enter the 6-digit code from your authenticator app'} error={errors.code?.message}>
              {(a) => <Input {...a} {...register('code')} autoComplete="one-time-code" inputMode="numeric" className="tabular text-xl font-semibold tracking-[0.3em]" />}
            </FormField>
            <Button type="submit" size="lg">Verify app</Button>
          </form>
        </li>
      </ol>
    </AuthLayout>
  )
}

/** Deterministic placeholder pattern standing in for the TOTP QR image. */
function FakeQr() {
  const n = 21
  const cells: boolean[] = []
  let seed = 7
  for (let i = 0; i < n * n; i++) {
    seed = (seed * 9301 + 49297) % 233280
    cells.push(seed / 233280 > 0.52)
  }
  const finder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7
    const ring = (ox: number, oy: number) => inBox(ox, oy) && !(x > ox && x < ox + 6 && y > oy && y < oy + 6 && !(x > ox + 1 && x < ox + 5 && y > oy + 1 && y < oy + 5))
    return [[0, 0], [14, 0], [0, 14]].some(([ox, oy]) => inBox(ox, oy)) ? [[0, 0], [14, 0], [0, 14]].some(([ox, oy]) => ring(ox, oy)) : null
  }
  return (
    <svg role="img" aria-label={`QR code for adding Bodylia to your authenticator app. Manual key: ${SECRET}`} viewBox={`0 0 ${n} ${n}`} className="size-36 shrink-0 rounded-md bg-white p-2 ring-1 ring-stone">
      {cells.map((on, i) => {
        const x = i % n
        const y = Math.floor(i / n)
        const f = finder(x, y)
        return (f ?? on) ? <rect key={i} x={x} y={y} width="1" height="1" fill="#3d1c2b" /> : null
      })}
    </svg>
  )
}
