import React, { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye } from 'lucide-react'
import type { StaffUser } from '../data/admin-seed'
import { store, useStore } from '../lib/store'
import { toast } from '../lib/toast'
import { Button } from '../components/ui/button'
import { Input, Textarea } from '../components/ui/input'
import { FormField } from '../components/ui/form-field'
import { Checkbox } from '../components/ui/checkbox'
import { Dialog, DialogContent } from '../components/ui/dialog'
import { MaintenancePage } from '../components/public/MaintenancePage'
import { PageHeader } from './PageHeader'
import { settingsSchema, type SettingsInput } from './schemas'

export function SettingsPage({ user }: { user: StaffUser }) {
  const settings = useStore((s) => s.settings)
  const [preview, setPreview] = useState(false)
  const [confirm, setConfirm] = useState<SettingsInput | null>(null)
  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<SettingsInput>({ resolver: zodResolver(settingsSchema), defaultValues: settings })
  const maintenance = watch('maintenance')

  const save = (v: SettingsInput) => {
    const next = {
      ...v,
      rateLimitPerMinute: Number(v.rateLimitPerMinute),
      replyTargetHours: Number(v.replyTargetHours),
      retentionMonths: Number(v.retentionMonths),
      sessionMinutes: Number(v.sessionMinutes),
    }
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== settings[k])
    store.set(() => ({ settings: next }))
    store.audit(user.name, 'Updated settings', changed.join(', ') || 'No changes')
    reset(next)
    setConfirm(null)
    toast('Settings saved', { description: next.maintenance ? 'Maintenance mode is ON — customers see the pause page.' : `${changed.length} setting${changed.length === 1 ? '' : 's'} changed` })
  }

  const submit = handleSubmit((v) => (v.maintenance && !settings.maintenance ? setConfirm(v) : save(v)))

  return (
    <div>
      <PageHeader title="Settings" description="System-wide rules for the public check and the console. Every change is audited." />
      <form onSubmit={submit} noValidate className="mt-8 flex max-w-3xl flex-col gap-10">
        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="mb-4 font-serif text-2xl font-semibold text-burgundy">Public batch check</legend>
          <FormField id="set-rate" label="Checks allowed per minute, per device" description="Stops automated scraping. 10 suits families on shared Wi-Fi." error={errors.rateLimitPerMinute?.message}>
            {(a) => <Input {...a} {...register('rateLimitPerMinute')} type="number" inputMode="numeric" />}
          </FormField>
          <FormField id="set-email" label="Support email shown to customers" error={errors.supportEmail?.message}>
            {(a) => <Input {...a} {...register('supportEmail')} type="email" />}
          </FormField>
        </fieldset>

        <fieldset className="grid gap-5 border-t border-mist pt-8 sm:grid-cols-2">
          <legend className="mb-4 pt-8 font-serif text-2xl font-semibold text-burgundy">Reports & data</legend>
          <FormField id="set-target" label="Reply target (hours)" description="Shown to customers and used for “time to target”." error={errors.replyTargetHours?.message}>
            {(a) => <Input {...a} {...register('replyTargetHours')} type="number" inputMode="numeric" />}
          </FormField>
          <FormField id="set-ret" label="Keep report details for (months)" description="Must match the consent text customers agree to." error={errors.retentionMonths?.message}>
            {(a) => <Input {...a} {...register('retentionMonths')} type="number" inputMode="numeric" />}
          </FormField>
        </fieldset>

        <fieldset className="grid gap-5 border-t border-mist pt-8 sm:grid-cols-2">
          <legend className="mb-4 pt-8 font-serif text-2xl font-semibold text-burgundy">Staff security</legend>
          <FormField id="set-session" label="Sign out after inactivity (minutes)" description="Staff get a 2-minute warning first." error={errors.sessionMinutes?.message}>
            {(a) => <Input {...a} {...register('sessionMinutes')} type="number" inputMode="numeric" />}
          </FormField>
          <p className="self-end pb-3 text-sm text-graphite">2-step verification is required for every staff account and can’t be turned off.</p>
        </fieldset>

        <fieldset className="flex flex-col gap-5 border-t border-mist pt-8">
          <legend className="mb-4 pt-8 font-serif text-2xl font-semibold text-burgundy">Maintenance mode</legend>
          <Controller
            control={control}
            name="maintenance"
            render={({ field }) => (
              <div className="flex items-start gap-3">
                <Checkbox id="set-maint" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" />
                <label htmlFor="set-maint" className="text-graphite">
                  <span className="font-semibold">Pause public batch checks</span>
                  <span className="block text-sm text-muted">Customers see the message below instead of the check. The console keeps working.</span>
                </label>
              </div>
            )}
          />
          <FormField id="set-msg" label="Message to customers" optional={!maintenance} description={`${(watch('maintenanceMessage') ?? '').length}/240 characters`} error={errors.maintenanceMessage?.message}>
            {(a) => <Textarea {...a} {...register('maintenanceMessage')} className="min-h-24" />}
          </FormField>
          <FormField id="set-until" label="Expected back by" optional={!maintenance} error={errors.maintenanceUntil?.message} className="sm:max-w-xs">
            {(a) => <Input {...a} {...register('maintenanceUntil')} type="datetime-local" />}
          </FormField>
          <Button type="button" variant="ghost" className="-ml-3 self-start" onClick={() => setPreview(true)}>
            <Eye aria-hidden="true" />
            Preview the customer page
          </Button>
        </fieldset>

        <div className="flex gap-3 border-t border-mist pt-6">
          <Button type="submit" size="lg" disabled={!isDirty}>Save settings</Button>
          <Button type="button" variant="outline" size="lg" disabled={!isDirty} onClick={() => reset(settings)}>Discard changes</Button>
        </div>
      </form>

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent title="Customer view — maintenance" description="Preview only. Uses the saved message." className="max-w-3xl">
          <div className="overflow-hidden rounded-md ring-1 ring-mist">
            <MaintenancePage preview />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent title="Pause public batch checks?" description="Every customer who opens batch.bodylia.in — including from a QR code — will see the maintenance message until you turn this off." className="max-w-md">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button className="bg-error hover:bg-error/90" onClick={() => confirm && save(confirm)}>Turn on maintenance</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
