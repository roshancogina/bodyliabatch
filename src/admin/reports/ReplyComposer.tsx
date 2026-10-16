import React, { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, Pencil, Send } from 'lucide-react'
import type { StaffUser, SuspiciousReport } from '../../data/admin-seed'
import { getProduct } from '../../lib/products'
import { store } from '../../lib/store'
import { toast } from '../../lib/toast'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input, NativeSelect, Textarea } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { Checkbox } from '../../components/ui/checkbox'
import { replySchema, type ReplyInput } from '../schemas'
import { TEMPLATE_LABEL, fillTemplate, type TemplateId } from './templates'

export function ReplyComposer({
  user,
  report,
  batchKnown,
  open,
  onOpenChange,
}: {
  user: StaffUser
  report: SuspiciousReport
  batchKnown: boolean
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [preview, setPreview] = useState(false)
  const suggested: TemplateId = !batchKnown ? 'counterfeit' : report.batch.includes('RECALLED') ? 'recall' : 'genuine'
  const product = report.batch.length > 6 ? getProduct(report.batch.slice(0, 2)).name : 'Bodylia'
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ReplyInput>({ resolver: zodResolver(replySchema), defaultValues: { template: suggested, ...fillTemplate(suggested, report, user.name, product), resolve: false } })

  useEffect(() => {
    if (open) {
      reset({ template: suggested, ...fillTemplate(suggested, report, user.name, product), resolve: false })
      setPreview(false)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const v = watch()

  const send = handleSubmit(async (d) => {
    await new Promise((r) => setTimeout(r, 400))
    const resolveTo = d.template === 'counterfeit' ? 'resolved_counterfeit' : d.template === 'genuine' ? 'resolved_genuine' : null
    store.updateReport(report.reference, { assignee: report.assignee ?? user.name }, { by: user.name, kind: 'reply', text: `Reply sent: “${d.subject}”` })
    if (d.resolve && resolveTo) {
      store.updateReport(report.reference, { status: resolveTo }, { by: user.name, kind: 'status', text: `Status → ${resolveTo === 'resolved_genuine' ? 'Resolved · genuine' : 'Resolved · counterfeit'}` })
    } else if (report.status === 'new') {
      store.updateReport(report.reference, { status: 'investigating' })
    }
    store.audit(user.name, 'Replied to customer', report.reference, TEMPLATE_LABEL[d.template])
    onOpenChange(false)
    toast('Reply sent', { description: `To ${report.email}${d.resolve && resolveTo ? ' · report resolved' : ''}` })
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Reply to customer" description={`To ${report.fullName} <${report.email}> · ${report.reference}`} className="max-w-3xl">
        {preview ? (
          <div>
            <div className="rounded-md bg-ivory p-5 ring-1 ring-mist">
              <p className="text-sm text-muted">Subject</p>
              <p className="font-semibold text-graphite">{v.subject}</p>
              <p className="mt-4 whitespace-pre-wrap leading-7 text-graphite">{v.body}</p>
            </div>
            {Object.keys(errors).length > 0 && (
              <p role="alert" className="mt-3 text-sm font-medium text-error">Fix the highlighted issues before sending — go back to edit.</p>
            )}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setPreview(false)}>
                <Pencil aria-hidden="true" />
                Back to edit
              </Button>
              <Button onClick={send} disabled={isSubmitting}>
                <Send aria-hidden="true" />
                {isSubmitting ? 'Sending…' : 'Send reply'}
              </Button>
            </div>
          </div>
        ) : (
          <form noValidate onSubmit={handleSubmit(() => setPreview(true))} className="flex flex-col gap-5">
            <FormField id="rc-template" label="Template" description={`Suggested: ${TEMPLATE_LABEL[suggested]} (based on the batch record).`} error={errors.template?.message}>
              {(a) => (
                <NativeSelect
                  {...a}
                  {...register('template', {
                    onChange: (e) => {
                      const t = fillTemplate(e.target.value as TemplateId, report, user.name, product)
                      setValue('subject', t.subject)
                      setValue('body', t.body)
                    },
                  })}
                >
                  {(Object.keys(TEMPLATE_LABEL) as TemplateId[]).map((t) => <option key={t} value={t}>{TEMPLATE_LABEL[t]}</option>)}
                </NativeSelect>
              )}
            </FormField>
            <FormField id="rc-subject" label="Subject" error={errors.subject?.message}>
              {(a) => <Input {...a} {...register('subject')} />}
            </FormField>
            <FormField id="rc-body" label="Message" description={`${(v.body ?? '').length}/3000 characters. Replace anything in {{double braces}}.`} error={errors.body?.message}>
              {(a) => <Textarea {...a} {...register('body')} className="min-h-72 font-sans leading-7" />}
            </FormField>
            {(v.template === 'genuine' || v.template === 'counterfeit') && (
              <Controller
                control={control}
                name="resolve"
                render={({ field }) => (
                  <div className="flex items-start gap-3">
                    <Checkbox id="rc-resolve" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} className="mt-0.5" />
                    <label htmlFor="rc-resolve" className="text-graphite">
                      Also resolve the report as <strong>{v.template === 'genuine' ? 'genuine' : 'counterfeit'}</strong>
                    </label>
                  </div>
                )}
              />
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">
                <Eye aria-hidden="true" />
                Preview reply
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
