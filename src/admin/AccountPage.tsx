import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller } from 'react-hook-form'
import { ROLE_DESCRIPTION, ROLE_LABEL, type StaffUser } from '../data/admin-seed'
import { store } from '../lib/store'
import { toast } from '../lib/toast'
import { PREVIEW_PASSWORD } from '../lib/auth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { FormField } from '../components/ui/form-field'
import { Checkbox } from '../components/ui/checkbox'
import { Dialog, DialogContent } from '../components/ui/dialog'
import { PageHeader } from './PageHeader'
import { PasswordField } from './access/PasswordField'
import { changePasswordSchema, profileSchema, type ChangePasswordInput, type ProfileInput } from './schemas'

export function AccountPage({ user, onSignOut, onPreviewTimeout }: { user: StaffUser; onSignOut: () => void; onPreviewTimeout: () => void }) {
  const [confirmMfa, setConfirmMfa] = useState(false)

  const profile = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, notifyEscalations: user.role !== 'support', notifyDigest: true },
  })
  const pw = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema), defaultValues: { current: '', password: '', confirm: '' } })

  return (
    <div>
      <PageHeader title="My account" description={`${ROLE_LABEL[user.role]} · ${user.email}`} />

      <div className="mt-8 grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="prof-title">
          <h2 id="prof-title" className="font-serif text-2xl font-semibold text-burgundy">Profile & notifications</h2>
          <form
            noValidate
            className="mt-4 flex flex-col gap-5"
            onSubmit={profile.handleSubmit((v) => {
              store.set((s) => ({ users: s.users.map((u) => (u.id === user.id ? { ...u, name: v.name } : u)) }))
              store.audit(v.name, 'Updated profile', user.email)
              toast('Profile saved')
            })}
          >
            <FormField id="ac-name" label="Full name" error={profile.formState.errors.name?.message}>
              {(a) => <Input {...a} {...profile.register('name')} autoComplete="name" />}
            </FormField>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-semibold">Email me about</legend>
              {(['notifyEscalations', 'notifyDigest'] as const).map((k) => (
                <Controller
                  key={k}
                  control={profile.control}
                  name={k}
                  render={({ field }) => (
                    <div className="flex items-start gap-3">
                      <Checkbox id={`ac-${k}`} checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" />
                      <label htmlFor={`ac-${k}`} className="text-graphite">
                        {k === 'notifyEscalations' ? 'Urgent escalations and recalls, as they happen' : 'A daily 9 am digest of open reports and expiring batches'}
                      </label>
                    </div>
                  )}
                />
              ))}
            </fieldset>
            <Button type="submit" className="self-start">Save profile</Button>
          </form>

          <h3 className="mt-10 font-semibold text-graphite">Your role</h3>
          <p className="mt-1 text-graphite">{ROLE_LABEL[user.role]} — {ROLE_DESCRIPTION[user.role]}</p>
          <p className="mt-1 text-sm text-muted">Only an administrator can change roles.</p>
        </section>

        <section aria-labelledby="sec-title">
          <h2 id="sec-title" className="font-serif text-2xl font-semibold text-burgundy">Security</h2>
          <form
            noValidate
            className="mt-4 flex flex-col gap-5"
            onSubmit={pw.handleSubmit((v) => {
              if (v.current !== PREVIEW_PASSWORD) {
                pw.setError('current', { message: 'That isn’t your current password.' })
                return
              }
              store.audit(user.name, 'Changed password', user.email)
              pw.reset()
              toast('Password changed', { description: 'Other devices have been signed out.' })
            })}
          >
            <FormField id="ac-current" label="Current password" error={pw.formState.errors.current?.message}>
              {(a) => <PasswordField {...a} {...pw.register('current')} autoComplete="current-password" />}
            </FormField>
            <FormField id="ac-new" label="New password" description="12+ characters with upper and lower case, a number and a symbol." error={pw.formState.errors.password?.message}>
              {(a) => <PasswordField {...a} {...pw.register('password')} autoComplete="new-password" />}
            </FormField>
            <FormField id="ac-confirm" label="Confirm new password" error={pw.formState.errors.confirm?.message}>
              {(a) => <PasswordField {...a} {...pw.register('confirm')} autoComplete="new-password" />}
            </FormField>
            <Button type="submit" className="self-start">Change password</Button>
          </form>

          <div className="mt-10 flex flex-col gap-6 border-t border-mist pt-6">
            <div>
              <h3 className="font-semibold text-graphite">2-step verification</h3>
              <p className="mt-1 text-graphite">{user.mfa ? 'On — authenticator app.' : 'Not set up.'} Required for all staff.</p>
              <Button variant="outline" className="mt-3" onClick={() => setConfirmMfa(true)}>Generate new recovery codes</Button>
            </div>
            <div>
              <h3 className="font-semibold text-graphite">Sessions</h3>
              <p className="mt-1 text-graphite">You’re signed out automatically after a period of inactivity, with a 2-minute warning first.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    store.audit(user.name, 'Signed out other devices', user.email)
                    toast('Signed out of all other devices')
                  }}
                >
                  Sign out other devices
                </Button>
                <Button variant="ghost" onClick={onPreviewTimeout}>Preview the timeout warning</Button>
                <Button variant="ghost" onClick={onSignOut}>Sign out</Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={confirmMfa} onOpenChange={setConfirmMfa}>
        <DialogContent title="Replace your recovery codes?" description="Your current codes will stop working immediately." className="max-w-md">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmMfa(false)}>Cancel</Button>
            <Button
              onClick={() => {
                store.audit(user.name, 'Regenerated recovery codes', user.email)
                setConfirmMfa(false)
                toast('New recovery codes generated', { description: 'Download them from the email we just sent.' })
              }}
            >
              Replace codes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
