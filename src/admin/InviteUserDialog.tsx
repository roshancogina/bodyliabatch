import React, { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ROLE_DESCRIPTION, ROLE_LABEL, type Role, type StaffUser } from '../data/admin-seed'
import { store, useStore } from '../lib/store'
import { Dialog, DialogContent } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { FormField } from '../components/ui/form-field'
import { toast } from '../lib/toast'
import { inviteUserSchema, type InviteUserInput } from './schemas'

export function InviteUserDialog({ user, open, onOpenChange }: { user: StaffUser; open: boolean; onOpenChange: (o: boolean) => void }) {
  const users = useStore((s) => s.users)
  const schema = useMemo(() => inviteUserSchema(users.map((u) => u.email.toLowerCase())), [users])
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteUserInput>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', role: 'support' } })

  const submit = handleSubmit((v) => {
    store.set((s) => ({
      users: [...s.users, { id: `u${Date.now()}`, name: v.name, email: v.email, role: v.role, status: 'invited', lastActive: new Date().toISOString(), mfa: false, invitedBy: user.name }],
    }))
    store.audit(user.name, 'Invited staff', v.email, ROLE_LABEL[v.role])
    toast(`Invitation sent to ${v.email}`, { description: `${ROLE_LABEL[v.role]} · expires in 7 days` })
    reset()
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent title="Invite staff" description="They’ll get an email to set a password. The invitation expires in 7 days." className="max-w-lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <FormField id="iu-name" label="Full name" error={errors.name?.message}>
            {(a) => <Input {...a} {...register('name')} autoComplete="off" />}
          </FormField>
          <FormField id="iu-email" label="Work email" description="Must be a @bodylia.in address." error={errors.email?.message}>
            {(a) => <Input {...a} {...register('email')} type="email" autoComplete="off" />}
          </FormField>
          <fieldset aria-describedby={errors.role ? 'iu-role-err' : undefined}>
            <legend className="text-sm font-semibold text-graphite">Role</legend>
            <div className="mt-2 flex flex-col gap-2">
              {(['support', 'quality', 'admin'] as Role[]).map((r) => (
                <label key={r} className="flex cursor-pointer items-start gap-3 rounded-md border border-stone p-3 has-[:checked]:border-burgundy has-[:checked]:bg-sand">
                  <input type="radio" value={r} {...register('role')} className="mt-1 size-5 accent-[#4a1f33]" />
                  <span>
                    <span className="block font-semibold text-graphite">{ROLE_LABEL[r]}</span>
                    <span className="block text-sm text-muted">{ROLE_DESCRIPTION[r]}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.role && <p id="iu-role-err" className="mt-1.5 text-sm font-medium text-error">{errors.role.message}</p>}
          </fieldset>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Send invitation</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
