import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Mail, ShieldCheck } from 'lucide-react'
import type { StaffUser } from '../../data/admin-seed'
import { verifyTwoFactor } from '../../lib/auth'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { twoStepSchema } from '../schemas'
import { AuthLayout } from './AuthLayout'
import type { AccessStep } from '../AdminApp'

/**
 * Email one-time code step (production only).
 * Reachable only after the captcha-gated SignIn (signin → emailCode → shell).
 * The 6-digit code is delivered out-of-band (logged server-side; SMTP can be
 * wired behind handleVerifyTwoFactor without changing this component).
 */
export function EmailCodeStep({
  user,
  go,
  className,
}: {
  user: StaffUser
  go: (s: AccessStep) => void
  className?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [tempToken, setTempToken] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ code: string }>({ resolver: zodResolver(twoStepSchema), defaultValues: { code: '' } })

  const submit = handleSubmit(async ({ code }) => {
    setError(null)
    try {
      const token = tempToken ?? sessionStorage.getItem('bodylia.staff.temp2fa') ?? ''
      if (!token) {
        setError('Verification session expired — please sign in again.')
        go({ step: 'signin' })
        return
      }
      go({ step: 'shell', user: await verifyTwoFactor(token, code) })
    } catch (e) {
      setError((e as Error).message)
    }
  })

  return (
    <AuthLayout
      className={className}
      title="Confirm your identity"
      lead={
        <>
          A 6-digit code has been sent to <strong className="text-graphite">{user.email}</strong>.{' '}
          Enter it below to complete sign in.
        </>
      }
      back={{ label: 'Use a different account', onClick: () => go({ step: 'signin' }) }}
      aside="Email 2FA protects recalls and customer data. Even with your password, no one can sign in without access to your inbox."
    >
      {error && (
        <p role="alert" className="mb-5 rounded-md border-2 border-error bg-error-bg p-3 text-sm font-medium text-error">
          {error}
        </p>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormField
          id="code"
          label="Verification code"
          description="6-digit code sent to your email"
          error={errors.code?.message}
        >
          {(a) => (
            <Input
              {...a}
              {...register('code')}
              autoComplete="one-time-code"
              inputMode="numeric"
              autoCapitalize="off"
              spellCheck={false}
              className="tabular text-xl font-semibold tracking-[0.3em]"
            />
          )}
        </FormField>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          {isSubmitting ? 'Verifying…' : 'Verify and sign in'}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted">
        Didn’t receive the code?{' '}
        <button
          type="button"
          onClick={() => {
            setError(null)
            go({ step: 'signin' })
          }}
          className="font-semibold text-burgundy underline underline-offset-4"
        >
          Sign in again
        </button>
      </p>
    </AuthLayout>
  )
}
