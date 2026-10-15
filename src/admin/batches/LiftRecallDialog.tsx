import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { StaffUser } from '../../data/admin-seed'
import { store } from '../../lib/store'
import { toast } from '../../lib/toast'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Textarea } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { liftRecallSchema, type LiftRecallInput } from '../schemas'

export function LiftRecallDialog({ user, batch, open, onOpenChange }: { user: StaffUser; batch: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LiftRecallInput>({ resolver: zodResolver(liftRecallSchema), defaultValues: { reason: '' } })

  const submit = handleSubmit(({ reason }) => {
    store.set((s) => ({ batches: s.batches.map((b) => (b.batch === batch ? { ...b, status: 'released', recallReason: undefined } : b)) }))
    store.audit(user.name, 'Lifted recall', batch, reason)
    reset()
    onOpenChange(false)
    toast(`Recall lifted on ${batch}`, { description: 'Customers checking it now see “Genuine”.' })
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent title={`Lift the recall on ${batch}?`} description="Customers will immediately be told this batch is safe to use, and it leaves the public recalls page." className="max-w-lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <FormField id="lift-reason" label="Why is the recall being lifted?" description="Recorded in the audit log, e.g. relabelled stock re-tested and released." error={errors.reason?.message}>
            {(a) => <Textarea {...a} {...register('reason')} maxLength={400} />}
          </FormField>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Keep recall</Button>
            <Button type="submit">Lift recall</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
