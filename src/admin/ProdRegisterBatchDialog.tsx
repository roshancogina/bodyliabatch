import React from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { listProducts } from '../lib/products'
import { Dialog, DialogContent } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Input, NativeSelect, Textarea } from '../components/ui/input'
import { FormField } from '../components/ui/form-field'
import { Checkbox } from '../components/ui/checkbox'
import { toast } from '../lib/toast'
import { adminApi, AuthExpired } from './admin-api'
import { registerBatchSchema, type RegisterBatchInput, type RegisterBatchOutput } from './schemas'

const DEFAULT_COA = [
  { test: 'Assay (active)', specification: '', result: '', pass: true },
  { test: 'Total plate count', specification: '≤ 10,000 cfu/g', result: '', pass: true },
  { test: 'Lead (Pb)', specification: '≤ 1.0 ppm', result: '', pass: true },
]

/**
 * Production register-batch dialog — API-backed counterpart of the preview
 * RegisterBatchDialog (which writes to lib/store and throws in prod builds).
 * Submits POST /api/admin/batches (server validates canonical format, product
 * cross-check, alias uniqueness, COA rows; audited). Facility/lab are free
 * text — the Go API accepts plain strings.
 */
export function ProdRegisterBatchDialog({
  open,
  onOpenChange,
  onRegistered,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onRegistered: (batch: string) => void
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterBatchInput, unknown, RegisterBatchOutput>({
    resolver: zodResolver(registerBatchSchema),
    defaultValues: { batch: '', aliases: '', manufactured: '', expires: '', facility: '', lab: '', coa: DEFAULT_COA },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'coa' })

  const submit = handleSubmit(async (v) => {
    try {
      await adminApi('/api/admin/batches', {
        method: 'POST',
        body: {
          batch: v.batch,
          product: v.product,
          manufactured: v.manufactured,
          expires: v.expires,
          facility: v.facility,
          lab: v.lab,
          aliases: v.aliases.map((code) => ({ code, kind: 'manufacturer' })),
          coa: v.coa,
        },
      })
      toast(`${v.batch} registered`, {
        description: v.aliases.length
          ? `Customers can verify it via ${v.aliases.length} mapped code${v.aliases.length === 1 ? '' : 's'} too.`
          : 'Customers can verify it now.',
      })
      reset()
      onOpenChange(false)
      onRegistered(v.batch)
    } catch (e) {
      if (e instanceof AuthExpired) {
        toast('Session expired — sign in again.')
        return
      }
      const msg = (e as Error).message
      // Mirror the server's duplicate signals onto the right fields.
      if (msg.includes('batch number is already registered')) {
        setError('batch', { message: 'This batch number is already registered.' })
        return
      }
      if (msg.includes('already used')) {
        setError('aliases', { message: msg })
        return
      }
      toast(msg)
    }
  })

  const close = (o: boolean) => {
    if (!o) reset()
    onOpenChange(o)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title="Register a batch" description="Only register batches that have passed release testing. Customers can check it as soon as you save." className="max-w-3xl">
        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="prb-batch" label="Batch number" description="XX-NNNN-XXNN, e.g. PE-2610-WL01 (spaces are ignored)" error={errors.batch?.message}>
              {(a) => <Input {...a} {...register('batch')} autoCapitalize="characters" spellCheck={false} className="tabular font-semibold tracking-wide" />}
            </FormField>
            <FormField id="prb-product" label="Product" description="Must match the code in the batch number." error={errors.product?.message}>
              {(a) => (
                <NativeSelect {...a} {...register('product')} defaultValue="">
                  <option value="" disabled>Choose a product</option>
                  {listProducts().map((p) => (
                    <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField id="prb-aliases" label="Mapped batch codes" optional description="Manufacturer or label codes for this batch, one per line or comma-separated. Entering any mapped code returns the same product details. e.g. 2K26001" error={errors.aliases?.message as string | undefined}>
              {(a) => <Textarea {...a} {...register('aliases')} autoCapitalize="characters" spellCheck={false} className="tabular min-h-20 font-semibold tracking-wide" placeholder="2K26001" />}
            </FormField>
            <FormField id="prb-mfg" label="Manufactured on" error={errors.manufactured?.message}>
              {(a) => <Input {...a} {...register('manufactured')} type="date" />}
            </FormField>
            <FormField id="prb-exp" label="Expires on" error={errors.expires?.message}>
              {(a) => <Input {...a} {...register('expires')} type="date" />}
            </FormField>
            <FormField id="prb-facility" label="Facility" description="Where the batch was packed, e.g. Goa Facility 1" error={errors.facility?.message}>
              {(a) => <Input {...a} {...register('facility')} />}
            </FormField>
            <FormField id="prb-lab" label="Testing lab" description="e.g. Eurofins Analytical Labs" error={errors.lab?.message}>
              {(a) => <Input {...a} {...register('lab')} />}
            </FormField>
          </div>

          <fieldset className="border-t border-mist pt-5">
            <legend className="pt-5 text-lg font-semibold text-graphite">Lab results</legend>
            {errors.coa?.message && (
              <p role="alert" className="mt-2 text-sm font-medium text-error">{errors.coa.message}</p>
            )}
            {errors.coa?.root?.message && (
              <p role="alert" className="mt-2 text-sm font-medium text-error">{errors.coa.root.message}</p>
            )}
            <ol className="mt-3 flex flex-col gap-4">
              {fields.map((f, i) => {
                const e = errors.coa?.[i]
                return (
                  <li key={f.id} className="grid gap-3 rounded-md bg-ivory p-3 ring-1 ring-mist sm:grid-cols-[1.3fr_1fr_1fr_auto_auto] sm:items-start">
                    <FormField id={`prb-coa-${i}-test`} label={`Test ${i + 1}`} error={e?.test?.message}>
                      {(a) => <Input {...a} {...register(`coa.${i}.test`)} />}
                    </FormField>
                    <FormField id={`prb-coa-${i}-spec`} label="Specification" error={e?.specification?.message}>
                      {(a) => <Input {...a} {...register(`coa.${i}.specification`)} />}
                    </FormField>
                    <FormField id={`prb-coa-${i}-result`} label="Result" error={e?.result?.message}>
                      {(a) => <Input {...a} {...register(`coa.${i}.result`)} />}
                    </FormField>
                    <Controller
                      control={control}
                      name={`coa.${i}.pass`}
                      render={({ field }) => (
                        <div className="flex min-h-11 items-center gap-2 sm:mt-7">
                          <Checkbox id={`prb-coa-${i}-pass`} checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} ref={field.ref} />
                          <label htmlFor={`prb-coa-${i}-pass`} className="text-sm font-semibold">Pass</label>
                        </div>
                      )}
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)} aria-label={`Remove test ${i + 1}`} className="sm:mt-7">
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                )
              })}
            </ol>
            <Button type="button" variant="ghost" size="sm" className="mt-3 -ml-3" onClick={() => append({ test: '', specification: '', result: '', pass: true })}>
              <Plus aria-hidden="true" />
              Add test
            </Button>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-mist pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Register batch</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

