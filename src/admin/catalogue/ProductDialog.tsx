import React, { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { StaffUser } from '../../data/admin-seed'
import type { Product } from '../../data/products'
import { store, useStore } from '../../lib/store'
import { toast } from '../../lib/toast'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { productSchema, type ProductInput } from '../schemas'

const EMPTY: ProductInput = { code: '', name: '', claim: '', format: '', shelfLifeMonths: 24, image: '' }

export function ProductDialog({ user, editing, onClose }: { user: StaffUser; editing: Product | 'new' | null; onClose: () => void }) {
  const products = useStore((s) => s.products)
  const isNew = editing === 'new'
  const schema = useMemo(() => productSchema(products.map((p) => p.code), isNew || !editing ? undefined : editing.code), [products, editing, isNew])
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProductInput>({ resolver: zodResolver(schema), defaultValues: EMPTY })

  useEffect(() => {
    if (editing) reset(editing === 'new' ? EMPTY : { ...editing })
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editing) return null
  const img = watch('image')

  const submit = handleSubmit((v) => {
    const p: Product = { code: v.code.toUpperCase(), name: v.name, claim: v.claim, format: v.format, shelfLifeMonths: Number(v.shelfLifeMonths), image: v.image }
    store.set((s) => ({ products: isNew ? [...s.products, p] : s.products.map((x) => (x.code === p.code ? { ...x, ...p } : x)) }))
    store.audit(user.name, isNew ? 'Added product' : 'Edited product', p.name, `Code ${p.code}`)
    toast(isNew ? `${p.name} added` : `${p.name} saved`, { description: isNew ? `Batches can now use BDL-${p.code}-…` : undefined })
    onClose()
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={isNew ? 'Add a product' : `Edit ${editing.name}`} description="Changes appear on customer verdicts and certificates immediately." className="max-w-2xl">
        <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
          <FormField id="pd-code" label="Batch code" description="2 letters used in batch numbers. Can’t change later." error={errors.code?.message}>
            {(a) => <Input {...a} {...register('code')} disabled={!isNew} maxLength={2} autoCapitalize="characters" className="tabular font-semibold uppercase" />}
          </FormField>
          <FormField id="pd-name" label="Product name" error={errors.name?.message}>
            {(a) => <Input {...a} {...register('name')} />}
          </FormField>
          <FormField id="pd-claim" label="On-pack claim" className="sm:col-span-2" error={errors.claim?.message}>
            {(a) => <Input {...a} {...register('claim')} />}
          </FormField>
          <FormField id="pd-format" label="Pack format" description="e.g. 30 veg. HPMC capsules" error={errors.format?.message}>
            {(a) => <Input {...a} {...register('format')} />}
          </FormField>
          <FormField id="pd-shelf" label="Shelf life (months)" error={errors.shelfLifeMonths?.message}>
            {(a) => <Input {...a} {...register('shelfLifeMonths')} type="number" inputMode="numeric" min={6} max={60} />}
          </FormField>
          <FormField id="pd-image" label="Pack image URL" description="Transparent PNG, front-facing." className="sm:col-span-2" error={errors.image?.message}>
            {(a) => (
              <div className="flex items-center gap-3">
                <Input {...a} {...register('image')} type="url" />
                {img && /^https?:\/\//.test(img) && <img src={img} alt="Image preview" className="size-12 shrink-0 rounded bg-sand object-contain p-1" />}
              </div>
            )}
          </FormField>
          <div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{isNew ? 'Add product' : 'Save changes'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
