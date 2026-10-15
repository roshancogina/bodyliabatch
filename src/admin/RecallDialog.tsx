import React, { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { StaffUser } from '../data/admin-seed'
import { store } from '../lib/store'
import { toast } from '../lib/toast'
import { Dialog, DialogContent } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Input, Textarea } from '../components/ui/input'
import { FormField } from '../components/ui/form-field'
import { recallSchema, type RecallInput } from './schemas'

export function RecallDialog({
  user,
  batch,
  open,
  onOpenChange,
}: {
  user: StaffUser
  batch: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const schema = useMemo(() => recallSchema(batch), [batch])
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RecallInput>({ resolver: zodResolver(schema), defaultValues: { reason: '', confirm: '' } })

  const submit = handleSubmit(({ reason }) => {
    store.set((s) => ({
      batches: s.batches.map((b) => (b.batch === batch ? { ...b, status: 'recalled', recallReason: reason } : b)),
    }))
    store.audit(user.name, 'Recalled batch', batch, reason)
    store.notify(`Batch ${batch} recalled by ${user.name}`, ['admin', 'quality', 'support'])
    toast(`${batch} recalled`, { description: 'The public verdict and recalls page updated instantly.' })
    reset()
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent title={`Recall ${batch}?`} description="Customers checking this batch will immediately be told to stop using it." className="max-w-lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <FormField id="recall-reason" label="Reason shown to customers" description="Plain language. Say what’s wrong and whether it’s a safety issue." error={errors.reason?.message}>
            {(a) => <Textarea {...a} {...register('reason')} maxLength={400} />}
          </FormField>
          <FormField id="recall-confirm" label={`Type ${batch} to confirm`} error={errors.confirm?.message}>
            {(a) => <Input {...a} {...register('confirm')} autoComplete="off" spellCheck={false} className="tabular font-semibold" />}
          </FormField>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-error hover:bg-error/90">Recall batch</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
