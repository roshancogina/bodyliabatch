import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Loader2 } from 'lucide-react'
import type { BatchRecord } from '../../data/batches'
import { adminApi } from '../admin-api'
import { toast } from '../../lib/toast'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input, Textarea } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import {
  csvRowSchema,
  editBatchSchema,
  liftRecallSchema,
  recallSchema,
  type EditBatchInput,
  type LiftRecallInput,
  type RecallInput,
} from '../schemas'

/**
 * Production batch operations (API-backed): edit release details, recall /
 * restore, and all-or-nothing CSV import — wired to
 * PATCH /api/admin/batches/:batch (reason REQUIRED, audited),
 * POST/DELETE /api/admin/batches/:batch/recall (audited) and
 * POST /api/admin/import/batches. Contract: backend-go/admin_cms_test.go.
 */

export function ProdBatchEditDialog({
  record,
  onClose,
  onSaved,
}: {
  record: BatchRecord | null
  onClose: () => void
  onSaved: () => void
}) {
  const form = useForm<EditBatchInput>({
    resolver: zodResolver(editBatchSchema(true)),
    defaultValues: { manufactured: '', expires: '', facility: '', lab: '', reason: '' },
  })
  const { handleSubmit, reset, formState } = form
  // Re-seed the form whenever a different batch is opened.
  useEffect(() => {
    if (record) {
      reset({
        manufactured: record.manufactured,
        expires: record.expires,
        facility: record.facility,
        lab: record.lab,
        reason: '',
      })
    }
  }, [record, reset])

  const submit = handleSubmit(async (v) => {
    if (!record) return
    try {
      await adminApi(`/api/admin/batches/${encodeURIComponent(record.batch)}`, {
        method: 'PATCH',
        body: {
          manufactured: v.manufactured,
          expires: v.expires,
          facility: v.facility,
          lab: v.lab,
          reason: v.reason,
        },
      })
      toast(`${record.batch} updated`, { description: 'The change is recorded in the audit log.' })
      onSaved()
      onClose()
    } catch (e) {
      toast((e as Error).message, { tone: 'error' })
    }
  })

  if (!record) return null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Edit ${record.batch}`}
        description="Customers may already be reading these details — every edit is recorded in the audit log with your reason."
        className="max-w-lg"
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FormField id="be-mfg" label="Manufactured" error={formState.errors.manufactured?.message}>
            {(a) => <Input {...a} type="date" {...form.register('manufactured')} />}
          </FormField>
          <FormField id="be-exp" label="Expires" error={formState.errors.expires?.message}>
            {(a) => <Input {...a} type="date" {...form.register('expires')} />}
          </FormField>
          <FormField id="be-fac" label="Manufacturing facility" error={formState.errors.facility?.message}>
            {(a) => <Input {...a} {...form.register('facility')} maxLength={120} />}
          </FormField>
          <FormField id="be-lab" label="Testing lab" error={formState.errors.lab?.message}>
            {(a) => <Input {...a} {...form.register('lab')} maxLength={120} />}
          </FormField>
          <FormField
            id="be-reason"
            label="Reason for the change"
            description="At least 20 characters — recorded in the audit log."
            error={formState.errors.reason?.message}
          >
            {(a) => <Textarea {...a} rows={2} {...form.register('reason')} maxLength={400} />}
          </FormField>
          <div className="flex gap-3">
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Save changes
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ProdBatchRecallDialog({
  record,
  mode,
  onClose,
  onSaved,
}: {
  record: BatchRecord | null
  mode: 'recall' | 'restore'
  onClose: () => void
  onSaved: () => void
}) {
  const recallForm = useForm<RecallInput>({
    resolver: zodResolver(recallSchema(record?.batch ?? '')),
    defaultValues: { reason: '', confirm: '' },
  })
  const restoreForm = useForm<LiftRecallInput>({
    resolver: zodResolver(liftRecallSchema),
    defaultValues: { reason: '' },
  })
  useEffect(() => {
    recallForm.reset({ reason: '', confirm: '' })
    restoreForm.reset({ reason: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.batch, mode])

  const submitRecall = recallForm.handleSubmit(async (v) => {
    if (!record) return
    try {
      await adminApi(`/api/admin/batches/${encodeURIComponent(record.batch)}/recall`, {
        method: 'POST',
        body: { reason: v.reason },
      })
      toast(`${record.batch} recalled`, { tone: 'info', description: 'Public checks now show the recall notice.' })
      onSaved()
      onClose()
    } catch (e) {
      toast((e as Error).message, { tone: 'error' })
    }
  })
  const submitRestore = restoreForm.handleSubmit(async (v) => {
    if (!record) return
    try {
      await adminApi(`/api/admin/batches/${encodeURIComponent(record.batch)}/recall`, {
        method: 'DELETE',
        body: { reason: v.reason },
      })
      toast(`${record.batch} restored`, { description: 'The recall notice is removed from public checks.' })
      onSaved()
      onClose()
    } catch (e) {
      toast((e as Error).message, { tone: 'error' })
    }
  })

  if (!record) return null
  const recall = mode === 'recall'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`${recall ? 'Recall' : 'Restore'} ${record.batch}`}
        description={
          recall
            ? 'Every public verification of this batch will show the recall notice until it is restored.'
            : 'The batch verifies as genuine again. The reason is recorded in the audit log.'
        }
        className="max-w-lg"
      >
        {recall ? (
          <form onSubmit={submitRecall} className="flex flex-col gap-4">
            <FormField
              id="br-reason"
              label="Reason customers will read"
              description="At least 20 characters."
              error={recallForm.formState.errors.reason?.message}
            >
              {(a) => <Textarea {...a} rows={3} {...recallForm.register('reason')} maxLength={400} />}
            </FormField>
            <FormField
              id="br-confirm"
              label={`Type ${record.batch} to confirm`}
              error={recallForm.formState.errors.confirm?.message}
            >
              {(a) => <Input {...a} {...recallForm.register('confirm')} autoComplete="off" />}
            </FormField>
            <div className="flex gap-3">
              <Button type="submit" disabled={recallForm.formState.isSubmitting}>
                {recallForm.formState.isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Recall batch
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitRestore} className="flex flex-col gap-4">
            <FormField
              id="bu-reason"
              label="Why is the recall being lifted?"
              description="At least 20 characters."
              error={restoreForm.formState.errors.reason?.message}
            >
              {(a) => <Textarea {...a} rows={3} {...restoreForm.register('reason')} maxLength={400} />}
            </FormField>
            <div className="flex gap-3">
              <Button type="submit" disabled={restoreForm.formState.isSubmitting}>
                {restoreForm.formState.isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Restore batch
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}


type CsvRowInput = z.infer<typeof csvRowSchema>

export function ProdBatchImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: () => void
}) {
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const grid = parseCsv(text).filter((row, i) => !(i === 0 && row[0]?.trim().toLowerCase() === 'batch'))
    if (grid.length === 0) {
      setErrors(['Paste at least one data row.'])
      return
    }
    const rows: CsvRowInput[] = []
    const errs: string[] = []
    grid.forEach((cells, i) => {
      const parsed = csvRowSchema.safeParse({
        batch: cells[0] ?? '',
        product: (cells[1] ?? '').trim().toUpperCase(),
        manufactured: cells[2] ?? '',
        expires: cells[3] ?? '',
        facility: cells[4] ?? '',
        lab: cells[5] ?? '',
        aliases: cells[6] ?? '',
      })
      if (!parsed.success) {
        errs.push(`Row ${i + 1}: ${parsed.error.issues[0]?.message ?? 'is not valid.'}`)
      } else {
        rows.push(parsed.data)
      }
    })
    setErrors(errs)
    if (errs.length > 0) return
    setBusy(true)
    try {
      const out = await adminApi<{ imported: number; aliases: number }>('/api/admin/import/batches', {
        method: 'POST',
        body: {
          rows: rows.map((r) => ({
            batch: r.batch,
            product: r.product.toUpperCase(),
            manufactured: r.manufactured,
            expires: r.expires,
            facility: r.facility,
            lab: r.lab,
            aliases: r.aliases,
          })),
        },
      })
      toast(`Imported ${out.imported} batch${out.imported === 1 ? '' : 'es'}`, {
        description: `${out.aliases} mapped code${out.aliases === 1 ? '' : 's'} attached. All-or-nothing: a failed row imports nothing.`,
      })
      onImported()
      onClose()
    } catch (err) {
      setErrors([(err as Error).message])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Import batches"
        description="One batch per CSV row: batch,product,manufactured,expires,facility,lab[,aliases] — dates as YYYY-MM-DD, aliases pipe-separated. All-or-nothing: if any row is invalid nothing is imported."
        className="max-w-2xl"
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FormField id="imp-csv" label="CSV rows" error={undefined}>
            {(a) => (
              <Textarea
                {...a}
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                placeholder={'batch,product,manufactured,expires,facility,lab,aliases\nPE-2611-WL01,PE,2026-11-01,2028-10-31,Unit 2 Baddi,Eurofins Bengaluru,MFG-NEW-1|LBL-NEW-1'}
                className="tabular text-xs"
              />
            )}
          </FormField>
          {errors.length > 0 && (
            <ul role="alert" className="flex flex-col gap-1 rounded-md border-2 border-error bg-error-bg p-3 text-sm text-error">
              {errors.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Import batches
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, commas inside quotes. */
function parseCsv(src: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      out.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell)
  out.push(row)
  return out.filter((r) => r.some((c) => c.trim()))
}

