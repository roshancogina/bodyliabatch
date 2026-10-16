import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, MailCheck } from 'lucide-react'
import { requestPasswordReset } from '../../lib/auth'
import { describeCaptchaError } from '../../lib/captcha'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { CaptchaField } from '../../components/CaptchaField'
import { forgotSchema } from '../schemas'
import { AuthLayout } from './AuthLayout'
import type { AccessStep } from '../AdminApp'

export function ForgotPassword({ go, className }: { go: (s: AccessStep) => void; className?: string }) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaError, setCaptchaError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } })

  const submit = handleSubmit(async ({ email }) => {
    setCaptchaError(null)
    if (!captchaToken) {
      setCaptchaError(describeCaptchaError('missing'))
      return
    }
    await requestPasswordReset(email)
    setSentTo(email)
  })

  if (sentTo)
    return (
      <AuthLayout className={className} title="Check your email" back={{ label: 'Back to sign in', onClick: () => go({ step: 'signin' }) }}>
        <div role="status">
          <MailCheck className="size-10 text-success" strokeWidth={1.75} aria-hidden="true" />
          <p className="mt-3 text-graphite">
            If <strong>{sentTo}</strong> belongs to a staff account, we’ve sent a link to reset the password. It expires in 30 minutes.
          </p>
          <p className="mt-3 text-sm text-muted">Nothing arrived after 5 minutes? Check spam, or ask an administrator to confirm your email address.</p>
        </div>
        <Button variant="outline" className="mt-6" onClick={() => go({ step: 'reset', email: sentTo })}>
          Preview: open the reset link
        </Button>
      </AuthLayout>
    )

  return (
    <AuthLayout
      className={className}
      title="Reset your password"
      lead="Enter your work email and we’ll send a reset link. You’ll still need your authenticator app to sign in."
      back={{ label: 'Back to sign in', onClick: () => go({ step: 'signin' }) }}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormField id="fp-email" label="Work email" error={errors.email?.message}>
          {(a) => <Input {...a} {...register('email')} type="email" autoComplete="username" />}
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
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  )
}
