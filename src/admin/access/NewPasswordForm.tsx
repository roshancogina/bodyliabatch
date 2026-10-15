import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Circle, Loader2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { FormField } from '../../components/ui/form-field'
import { PASSWORD_RULES, newPasswordSchema, type NewPasswordInput } from '../schemas'
import { PasswordField } from './PasswordField'
import { cn } from '../../lib/utils'

/** New password + confirm, with a live rules checklist announced politely. */
export function NewPasswordForm({ submitLabel, onValid }: { submitLabel: string; onValid: (password: string) => Promise<void> }) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordInput>({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: '', confirm: '' } })
  const pw = watch('password') ?? ''
  const met = PASSWORD_RULES.filter((r) => r.test(pw)).length

  return (
    <form onSubmit={handleSubmit(({ password }) => onValid(password))} noValidate className="flex flex-col gap-5">
      <FormField id="np-password" label="New password" error={errors.password?.message}>
        {(a) => <PasswordField {...a} {...register('password')} autoComplete="new-password" aria-describedby={[a['aria-describedby'], 'np-rules'].filter(Boolean).join(' ')} />}
      </FormField>
      <div id="np-rules">
        <p className="sr-only" aria-live="polite">{met} of {PASSWORD_RULES.length} password rules met</p>
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(pw)
            return (
              <li key={r.id} className={cn('flex items-center gap-2', ok ? 'text-success' : 'text-muted')}>
                {ok ? <Check className="size-4" aria-hidden="true" /> : <Circle className="size-4" aria-hidden="true" />}
                {r.label}
                <span className="sr-only">{ok ? ' — met' : ' — not yet met'}</span>
              </li>
            )
          })}
        </ul>
      </div>
      <FormField id="np-confirm" label="Confirm new password" error={errors.confirm?.message}>
        {(a) => <PasswordField {...a} {...register('confirm')} autoComplete="new-password" />}
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  )
}
