import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { StaffUser, SuspiciousReport } from '../../data/admin-seed'
import { store } from '../../lib/store'
import { toast } from '../../lib/toast'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Textarea } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { escalateSchema, type EscalateInput } from '../schemas'

export function EscalateDialog({ user, report, open, onOpenChange }: { user: StaffUser; report: SuspiciousReport; open: boolean; onOpenChange: (o: boolean) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EscalateInput>({ resolver: zodResolver(escalateSchema), defaultValues: { urgency: 'standard', reason: '' } })

  const submit = handleSubmit(({ urgency, reason }) => {
    const at = new Date().toISOString()
    store.updateReport(
      report.reference,
      { escalation: { by: user.name, at, reason, urgency, state: 'open' }, status: 'investigating', assignee: report.assignee ?? user.name },
      { by: user.name, kind: 'escalation', text: `Escalated to quality (${urgency})` },
    )
    store.audit(user.name, 'Escalated report', report.reference, urgency === 'urgent' ? 'Urgent' : 'Standard')
    store.notify(`${urgency === 'urgent' ? 'Urgent escalation' : 'Escalation'}: ${report.reference} from ${user.name}`, ['quality', 'admin'])
    reset()
    onOpenChange(false)
    toast('Escalated to quality', { description: urgency === 'urgent' ? 'The on-duty analyst has been notified.' : 'It’s in the quality inbox.' })
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent title="Escalate to quality" description="Use this when the batch record alone can’t answer the customer — for example a suspected counterfeit or a product defect." className="max-w-lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <fieldset>
            <legend className="text-sm font-semibold text-graphite">How urgent is it?</legend>
            <div className="mt-2 flex flex-col gap-2">
              {[
                ['standard', 'Standard', 'Quality reviews within 1 working day.'],
                ['urgent', 'Urgent', 'Possible safety issue or counterfeit cluster. Notifies the on-duty analyst now.'],
              ].map(([v, l, d]) => (
                <label key={v} className="flex cursor-pointer items-start gap-3 rounded-md border border-stone p-3 has-[:checked]:border-burgundy has-[:checked]:bg-sand">
                  <input type="radio" value={v} {...register('urgency')} className="mt-1 size-5 accent-[#4a1f33]" />
                  <span>
                    <span className="block font-semibold text-graphite">{l}</span>
                    <span className="block text-sm text-muted">{d}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.urgency && <p className="mt-1.5 text-sm font-medium text-error">{errors.urgency.message}</p>}
          </fieldset>
          <FormField id="esc-reason" label="What have you found?" description="Facts quality needs: pattern, seller, photos, what the customer reported." error={errors.reason?.message}>
            {(a) => <Textarea {...a} {...register('reason')} maxLength={600} />}
          </FormField>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Escalate</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
