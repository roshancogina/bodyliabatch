import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { Loader2, Lock } from 'lucide-react'
import { signInSchema, type SignInInput } from '../schemas'
import { AuthError, PREVIEW_PASSWORD, PREVIEW_TOTP, signIn } from '../../lib/auth'
import { describeCaptchaError } from '../../lib/captcha'
import { PREVIEW_AUTH_ENABLED } from '../../lib/runtime-env'
import { ROLE_LABEL } from '../../data/admin-seed'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { CaptchaField } from '../../components/CaptchaField'
import { AuthLayout } from './AuthLayout'
import { PasswordField } from './PasswordField'
import type { AccessStep } from '../AdminApp'

const PREVIEW_ACCOUNTS = [
  { email: 'admin@bodylia.in', role: 'admin' as const },
  { email: 'qa@bodylia.in', role: 'quality' as const },
  { email: 'support@bodylia.in', role: 'support' as const },
]

export function SignIn({ go, onExit, className }: { go: (s: AccessStep) => void; onExit?: () => void; className?: string }) {
  const [error, setError] = useState<{ text: string; lockedUntil?: number } | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaError, setCaptchaError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '' } })

  const submit = handleSubmit(async ({ email, password }) => {
    setError(null)
    setCaptchaError(null)
    if (!captchaToken) {
      setCaptchaError(describeCaptchaError('missing'))
      return
    }
    try {
      const user = await signIn(email, password)
      go({ step: 'twostep', user })
    } catch (e) {
      const err = e as AuthError
      setError({ text: err.message, lockedUntil: err.lockedUntil })
    }
  })

  return (
    <AuthLayout
      className={className}
      title="Staff sign in"
      lead="Use your @bodylia.in account. You’ll confirm with your authenticator app next."
      back={onExit ? { label: 'Back to batch check', onClick: onExit } : undefined}
    >
      {error && (
        <div role="alert" className="mb-5 rounded-md border-2 border-error bg-error-bg p-3 text-sm text-error">
          {error.lockedUntil ? (
            <>
              <p className="font-semibold">Account temporarily locked</p>
              <p className="mt-1 text-graphite">
                After 5 unsuccessful attempts we lock sign-in for 15 minutes to protect the account. Try again after{' '}
                <strong>{format(error.lockedUntil, 'h:mm a')}</strong>, or reset your password now.
              </p>
            </>
          ) : (
            <p className="font-medium">{error.text}</p>
          )}
        </div>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormField id="email" label="Work email" error={errors.email?.message}>
          {(a) => <Input {...a} {...register('email')} type="email" autoComplete="username" />}
        </FormField>
        <FormField id="password" label="Password" error={errors.password?.message}>
          {(a) => <PasswordField {...a} {...register('password')} autoComplete="current-password" />}
        </FormField>
        <CaptchaField
          onChange={(token) => {
            setCaptchaToken(token)
            if (token) setCaptchaError(null)
          }}
        />
        {captchaError && (
          <p role="alert" className="-mt-2 text-sm font-medium text-error">
            {captchaError}
          </p>
        )}
        <div className="-mt-2 flex justify-end">
          <button type="button" onClick={() => go({ step: 'forgot' })} className="inline-flex min-h-11 items-center text-sm font-semibold text-burgundy underline underline-offset-4 hover:decoration-2">
            Forgot password?
          </button>
        </div>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Lock aria-hidden="true" />}
          {isSubmitting ? 'Checking…' : 'Continue'}
        </Button>
      </form>

      {PREVIEW_AUTH_ENABLED && (
      <details className="mt-7 border-t border-mist pt-4">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-muted">Preview accounts and links</summary>
        <p className="mt-2 text-sm text-muted">
          Password <span className="tabular font-semibold text-graphite">{PREVIEW_PASSWORD}</span>, then code{' '}
          <span className="tabular font-semibold text-graphite">{PREVIEW_TOTP}</span>.
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {PREVIEW_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                onClick={() => {
                  setValue('email', a.email, { shouldValidate: true })
                  setValue('password', PREVIEW_PASSWORD, { shouldValidate: true })
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-stone px-3 text-left text-sm transition-colors duration-150 hover:border-taupe hover:bg-sand"
              >
                <span className="font-semibold text-graphite">{a.email}</span>
                <span className="text-muted">{ROLE_LABEL[a.role]}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-x-5 text-sm">
          <button type="button" onClick={() => go({ step: 'invite', email: 'kabir.m@bodylia.in' })} className="inline-flex min-h-11 items-center font-semibold text-burgundy underline underline-offset-4">
            Open an invitation link
          </button>
          <button type="button" onClick={() => go({ step: 'reset', email: 'qa@bodylia.in' })} className="inline-flex min-h-11 items-center font-semibold text-burgundy underline underline-offset-4">
            Open a password-reset link
          </button>
        </div>
      </details>
      )}
    </AuthLayout>
  )
}
