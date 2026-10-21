import React, { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle } from 'lucide-react'
import type { StaffUser } from '../../data/admin-seed'
import type { BatchRecord } from '../../data/batches'
import { store, useStore } from '../../lib/store'
import { toast } from '../../lib/toast'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input, NativeSelect, Textarea } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { editBatchSchema, type EditBatchInput } from '../schemas'

export function EditBatchDialog({ user, batch, open, onOpenChange }: { user: StaffUser; batch: BatchRecord; open: boolean; onOpenChange: (o: boolean) => void }) {
  const facilities = useStore((s) => s.facilities.filter((f) => !f.archived))
  const labs = useStore((s) => s.labs.filter((l) => !l.archived))
  const checked = !!batch.firstCheckedAt
  const schema = useMemo(() => editBatchSchema(checked), [checked])
  const defaults = { manufactured: batch.manufactured, expires: batch.expires, facility: batch.facility, lab: batch.lab, reason: '' }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<EditBatchInput>({ resolver: zodResolver(schema), defaultValues: defaults })

  useEffect(() => {
    if (open) reset(defaults)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = handleSubmit((v) => {
    const changes = (['manufactured', 'expires', 'facility', 'lab'] as const).filter((k) => v[k] !== batch[k])
    store.set((s) => ({ batches: s.batches.map((b) => (b.batch === batch.batch ? { ...b, manufactured: v.manufactured, expires: v.expires, facility: v.facility, lab: v.lab } : b)) }))
    store.audit(user.name, 'Edited batch', batch.batch, `${changes.join(', ') || 'no field changes'}${v.reason ? ` — ${v.reason}` : ''}`)
    onOpenChange(false)
    toast(`${batch.batch} updated`, { description: changes.length ? `Changed: ${changes.join(', ')}` : undefined })
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Edit ${batch.batch}`} description="The batch number and product can’t change — register a new batch instead." className="max-w-2xl">
        {checked && (
          <div className="mb-5 flex gap-3 rounded-md bg-warning-bg p-4 text-sm text-graphite">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-ink" aria-hidden="true" />
            <p>
              Customers have checked this batch since {new Date(batch.firstCheckedAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. A correction will change what they see, so a recorded reason is required.
            </p>
          </div>
        )}
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="eb-mfg" label="Manufactured on" error={errors.manufactured?.message}>
              {(a) => <Input {...a} {...register('manufactured')} type="date" />}
            </FormField>
            <FormField id="eb-exp" label="Expires on" error={errors.expires?.message}>
              {(a) => <Input {...a} {...register('expires')} type="date" />}
            </FormField>
            <FormField id="eb-fac" label="Facility" error={errors.facility?.message}>
              {(a) => (
                <NativeSelect {...a} {...register('facility')}>
                  {batch.facility && !facilities.some((f) => f.name === batch.facility) && (
                    <option value={batch.facility}>{batch.facility} (current)</option>
                  )}
                  {facilities.map((f) => (
                    <option key={f.id} value={f.name}>{f.name}</option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField id="eb-lab" label="Testing lab" error={errors.lab?.message}>
              {(a) => (
                <NativeSelect {...a} {...register('lab')}>
                  {batch.lab && !labs.some((l) => l.name === batch.lab) && (
                    <option value={batch.lab}>{batch.lab} (current)</option>
                  )}
                  {labs.map((l) => (
                    <option key={l.id} value={l.name}>{l.name}</option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          </div>
          <FormField id="eb-reason" label="Reason for the correction" optional={!checked} error={errors.reason?.message}>
            {(a) => <Textarea {...a} {...register('reason')} className="min-h-24" />}
          </FormField>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!isDirty}>Save changes</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
