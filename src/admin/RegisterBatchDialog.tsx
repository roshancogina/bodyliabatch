import React from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import type { StaffUser } from '../data/admin-seed'
import { getProduct, listProducts } from '../lib/products'
import type { CoaRow } from '../data/batches'
import { store, useStore } from '../lib/store'
import { Dialog, DialogContent } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Input, NativeSelect, Textarea } from '../components/ui/input'
import { FormField } from '../components/ui/form-field'
import { Checkbox } from '../components/ui/checkbox'
import { toast } from '../lib/toast'
import { registerBatchSchema, type RegisterBatchInput, type RegisterBatchOutput } from './schemas'

const DEFAULT_COA = [
  { test: 'Assay (active)', specification: '', result: '', pass: true },
  { test: 'Total plate count', specification: '≤ 10,000 cfu/g', result: '', pass: true },
  { test: 'Lead (Pb)', specification: '≤ 1.0 ppm', result: '', pass: true },
]

export function RegisterBatchDialog({
  user,
  open,
  onOpenChange,
  onRegistered,
}: {
  user: StaffUser
  open: boolean
  onOpenChange: (o: boolean) => void
  onRegistered: (batch: string) => void
}) {
  const facilities = useStore((s) => s.facilities.filter((f) => !f.archived).map((f) => f.name))
  const labs = useStore((s) => s.labs.filter((l) => !l.archived).map((l) => l.name))
  const [coaFile, setCoaFile] = React.useState<File | null>(null)
  const [coaError, setCoaError] = React.useState<string | null>(null)

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

  const submit = handleSubmit((v) => {
    const existing = store.get().batches
    if (existing.some((b) => b.batch === v.batch)) {
      setError('batch', { message: 'This batch number is already registered.' })
      return
    }
    // Aliases must be globally unique (no clash with another canonical or alias).
    const taken = new Map<string, string>()
    for (const b of existing) {
      taken.set(b.batch, b.batch)
      for (const a of b.aliases ?? []) taken.set(a, b.batch)
    }
    const clash = v.aliases.find((a) => taken.has(a))
    if (clash) {
      setError('aliases', { message: `"${clash}" is already used by ${taken.get(clash)}. Use a different vendor code.` })
      return
    }
    store.set((s) => ({
      batches: [
        { batch: v.batch, product: v.product, manufactured: v.manufactured, expires: v.expires, facility: v.facility, lab: v.lab, status: 'released', coa: v.coa as CoaRow[], coaFileName: coaFile?.name, aliases: v.aliases },
        ...s.batches,
      ],
    }))
    store.audit(user.name, 'Registered batch', v.batch, v.aliases.length ? `aliases: ${v.aliases.join(', ')}` : undefined)
    toast(`${v.batch} registered`, { description: v.aliases.length ? `Customers can verify it via ${v.aliases.length} vendor code${v.aliases.length === 1 ? '' : 's'} too.` : 'Customers can verify it now.' })
    setCoaFile(null)
    reset()
    onOpenChange(false)
    onRegistered(v.batch)
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
            <FormField id="rb-batch" label="Batch number" description="e.g. BDL-FN-2601-0042" error={errors.batch?.message}>
              {(a) => <Input {...a} {...register('batch')} autoCapitalize="characters" spellCheck={false} className="tabular font-semibold tracking-wide" />}
            </FormField>
            <FormField id="rb-product" label="Product" description="Must match the code in the batch number." error={errors.product?.message}>
              {(a) => (
                <NativeSelect {...a} {...register('product')} defaultValue="">
                  <option value="" disabled>Choose a product</option>
                  {listProducts().map((p) => (
                    <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField id="rb-aliases" label="Vendor aliases" optional description="Other lot codes printed by vendors, one per line or comma-separated. Customers can verify with any of these. e.g. FR-2509-312, VND-FR-0312" error={errors.aliases?.message as string | undefined}>
              {(a) => <Textarea {...a} {...register('aliases')} autoCapitalize="characters" spellCheck={false} className="tabular min-h-20 font-semibold tracking-wide" placeholder="FR-2509-312, VND-FR-0312" />}
            </FormField>
            <FormField id="rb-mfg" label="Manufactured on" error={errors.manufactured?.message}>
              {(a) => <Input {...a} {...register('manufactured')} type="date" />}
            </FormField>
            <FormField id="rb-exp" label="Expires on" error={errors.expires?.message}>
              {(a) => <Input {...a} {...register('expires')} type="date" />}
            </FormField>
            <FormField id="rb-facility" label="Facility" error={errors.facility?.message}>
              {(a) => (
                <NativeSelect {...a} {...register('facility')}>
                  <option value="" disabled>Choose a facility</option>
                  {facilities.map((f) => <option key={f}>{f}</option>)}
                </NativeSelect>
              )}
            </FormField>
            <FormField id="rb-lab" label="Testing lab" error={errors.lab?.message}>
              {(a) => (
                <NativeSelect {...a} {...register('lab')}>
                  <option value="" disabled>Choose a lab</option>
                  {labs.map((l) => <option key={l}>{l}</option>)}
                </NativeSelect>
              )}
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
                    <FormField id={`coa-${i}-test`} label={`Test ${i + 1}`} error={e?.test?.message}>
                      {(a) => <Input {...a} {...register(`coa.${i}.test`)} />}
                    </FormField>
                    <FormField id={`coa-${i}-spec`} label="Specification" error={e?.specification?.message}>
                      {(a) => <Input {...a} {...register(`coa.${i}.specification`)} />}
                    </FormField>
                    <FormField id={`coa-${i}-result`} label="Result" error={e?.result?.message}>
                      {(a) => <Input {...a} {...register(`coa.${i}.result`)} />}
                    </FormField>
                    <Controller
                      control={control}
                      name={`coa.${i}.pass`}
                      render={({ field }) => (
                        <div className="flex min-h-11 items-center gap-2 sm:mt-7">
                          <Checkbox id={`coa-${i}-pass`} checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} ref={field.ref} />
                          <label htmlFor={`coa-${i}-pass`} className="text-sm font-semibold">Pass</label>
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

          <div className="flex flex-col gap-1.5 border-t border-mist pt-5">
            <label htmlFor="rb-coa" className="text-sm font-semibold text-graphite">
              Signed lab certificate <span className="font-normal text-muted">(optional)</span>
            </label>
            <p id="rb-coa-desc" className="text-sm text-muted">PDF from the lab, up to 10 MB. If you skip this, customers get a certificate generated from the results above.</p>
            <input
              id="rb-coa"
              type="file"
              accept="application/pdf"
              aria-describedby={coaError ? 'rb-coa-desc rb-coa-err' : 'rb-coa-desc'}
              aria-invalid={!!coaError}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                if (f && f.type !== 'application/pdf') { setCoaError('The certificate must be a PDF.'); setCoaFile(null); return }
                if (f && f.size > 10 * 1024 * 1024) { setCoaError('The certificate must be 10 MB or smaller.'); setCoaFile(null); return }
                setCoaError(null)
                setCoaFile(f)
              }}
              className="flex min-h-11 w-full rounded-md border border-taupe bg-white px-3 py-1.5 text-base text-graphite file:mr-3 file:rounded file:border-0 file:bg-sand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-burgundy"
            />
            {coaError && <p id="rb-coa-err" className="text-sm font-medium text-error">{coaError}</p>}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-mist pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Register batch</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
