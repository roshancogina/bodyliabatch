import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, ShieldCheck } from 'lucide-react'
import type { StaffUser } from '../../data/admin-seed'
import { PREVIEW_TOTP, verifySecondStep } from '../../lib/auth'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { twoStepSchema } from '../schemas'
import { PREVIEW_AUTH_ENABLED } from '../../lib/runtime-env'
import { AuthLayout } from './AuthLayout'
import type { AccessStep } from '../AdminApp'

export function TwoStep({ user, go, className }: { user: StaffUser; go: (s: AccessStep) => void; className?: string }) {
  const [recovery, setRecovery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ code: string }>({ resolver: zodResolver(twoStepSchema), defaultValues: { code: '' } })

  const submit = handleSubmit(async ({ code }) => {
    setError(null)
    try {
      go({ step: 'shell', user: await verifySecondStep(user, code) })
    } catch (e) {
      setError((e as Error).message)
    }
  })

  return (
    <AuthLayout
      className={className}
      title={recovery ? 'Use a recovery code' : 'Enter your 6-digit code'}
      lead={
        recovery
          ? 'Each recovery code works once. After signing in, generate new codes from My account.'
          : <>Open your authenticator app and enter the code for <strong className="text-graphite">Bodylia · {user.email}</strong>.</>
      }
      back={{ label: 'Use a different account', onClick: () => go({ step: 'signin' }) }}
      aside="2-step verification protects recalls and customer data. Even with your password, no one can sign in without your phone."
    >
      {error && (
        <p role="alert" className="mb-5 rounded-md border-2 border-error bg-error-bg p-3 text-sm font-medium text-error">
          {error}
        </p>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormField id="code" label={recovery ? 'Recovery code' : 'Verification code'} description={recovery ? 'e.g. BDLRC-7Q4M-9X2K' : PREVIEW_AUTH_ENABLED ? `Preview code: ${PREVIEW_TOTP}` : 'Enter the 6-digit code from your authenticator app'} error={errors.code?.message}>
          {(a) => (
            <Input
              {...a}
              {...register('code')}
              autoComplete="one-time-code"
              inputMode={recovery ? 'text' : 'numeric'}
              autoCapitalize={recovery ? 'characters' : 'off'}
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
      <button
        type="button"
        onClick={() => {
          setRecovery((r) => !r)
          setError(null)
          reset({ code: '' })
        }}
        className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-burgundy underline underline-offset-4"
      >
        {recovery ? 'Use my authenticator app instead' : 'Lost your phone? Use a recovery code'}
      </button>
    </AuthLayout>
  )
}
