import React, { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { type Role, type StaffUser } from '../data/admin-seed'
import { ROLE_DESCRIPTION, ROLE_LABEL } from '../data/roles'
import { adminApi, AuthExpired } from './admin-api'
import { Dialog, DialogContent } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { FormField } from '../components/ui/form-field'
import { toast } from '../lib/toast'
import { inviteUserSchema, type InviteUserInput } from './schemas'

export function InviteUserDialog({ user, open, onOpenChange }: { user: StaffUser; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [existingEmails, setExistingEmails] = useState<string[]>([])
  const schema = useMemo(() => inviteUserSchema(existingEmails), [existingEmails])
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteUserInput>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', role: 'support' } })

  const submit = handleSubmit(async (v) => {
    try {
      await adminApi('/api/admin/staff', {
        method: 'POST',
        body: { name: v.name, email: v.email, role: v.role },
      })
      toast(`Invitation sent to ${v.email}`, { description: `${ROLE_LABEL[v.role]} · temporary password shown by the admin` })
      reset()
      onOpenChange(false)
    } catch (e) {
      if (!(e instanceof AuthExpired)) {
        toast((e as Error).message)
      }
    }
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
