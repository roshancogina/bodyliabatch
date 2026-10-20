import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { adminApi } from '../admin-api'
import { toast } from '../../lib/toast'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { NativeSelect } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import {
  productSchema,
  siteSchema,
  type ProductInput,
  type SiteInput,
} from '../schemas'

/**
 * Production catalogue dialogs (API-backed): create / edit products and
 * sites plus the hard-remove confirmation — wired to
 * POST/PATCH/DELETE /api/admin/catalogue/{products,sites}. Every mutation is
 * admin-only and audited server-side (backend-go/handlers_admin_misc.go,
 * contract: TestAdminCatalogueCRUD).
 */

export interface ProductRow {
  code: string
  name: string
  claim: string
  format: string
  image: string
  shelfLifeMonths: number
  archived: boolean
}

export interface SiteRow {
  id: string
  kind: string
  name: string
  accreditation: string
  accreditationExpires: string
  archived: boolean
}

export function ProdProductDialog({
  open,
  editing,
  existingCodes,
  onClose,
  onSaved,
}: {
  open: boolean
  editing: ProductRow | null
  existingCodes: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema(existingCodes, editing?.code)),
    defaultValues: { code: '', name: '', claim: '', format: '', shelfLifeMonths: 24, image: '' },
  })

  useEffect(() => {
    if (!open) return
    if (editing) {
      reset({
        code: editing.code,
        name: editing.name,
        claim: editing.claim,
        format: editing.format,
        shelfLifeMonths: editing.shelfLifeMonths,
        image: editing.image,
      })
    } else {
      reset({ code: '', name: '', claim: '', format: '', shelfLifeMonths: 24, image: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.code])

  const submit = handleSubmit(async (v) => {
    try {
      if (editing) {
        await adminApi(`/api/admin/catalogue/products/${encodeURIComponent(editing.code)}`, {
          method: 'PATCH',
          body: {
            name: v.name,
            claim: v.claim,
            format: v.format,
            shelfLifeMonths: Number(v.shelfLifeMonths),
            image: v.image,
          },
        })
        toast(`${v.name} updated`, { description: 'Recorded in the audit log.' })
      } else {
        await adminApi('/api/admin/catalogue/products', {
          method: 'POST',
          body: {
            code: v.code,
            name: v.name,
            claim: v.claim,
            format: v.format,
            shelfLifeMonths: Number(v.shelfLifeMonths),
            image: v.image,
          },
        })
        toast(`Product ${v.code.toUpperCase()} created`, { description: 'Recorded in the audit log.' })
      }
      onSaved()
      onClose()
    } catch (e) {
      const msg = (e as Error).message
      if (msg.includes('already exists')) setError('code', { message: msg })
      else toast(msg, { tone: 'error' })
    }
  })

  if (!open) return null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={editing ? `Edit ${editing.code}` : 'Add product'}
        description={
          editing
            ? 'Changes apply to future verifications and are recorded in the audit log.'
            : 'The two-letter code becomes the prefix of every batch number for this product.'
        }
        className="max-w-xl"
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FormField id="pd-code" label="Product code" error={errors.code?.message} description="Exactly 2 letters, e.g. PE.">
            {(a) => <Input {...a} {...register('code')} disabled={!!editing} maxLength={2} autoComplete="off" />}
          </FormField>
          <FormField id="pd-name" label="Name" error={errors.name?.message}>
            {(a) => <Input {...a} {...register('name')} maxLength={40} />}
          </FormField>
          <FormField id="pd-claim" label="On-pack claim" error={errors.claim?.message}>
            {(a) => <Input {...a} {...register('claim')} maxLength={120} />}
          </FormField>
          <FormField id="pd-format" label="Pack format" error={errors.format?.message}>
            {(a) => <Input {...a} {...register('format')} placeholder="30 veg. HPMC capsules" maxLength={120} />}
          </FormField>
          <FormField id="pd-shelf" label="Shelf life (months)" error={errors.shelfLifeMonths?.message}>
            {(a) => <Input {...a} type="number" inputMode="numeric" min={6} max={60} {...register('shelfLifeMonths')} />}
          </FormField>
          <FormField id="pd-image" label="Image URL" error={errors.image?.message} description="Full https:// URL.">
            {(a) => <Input {...a} {...register('image')} type="url" maxLength={500} />}
          </FormField>
          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {editing ? 'Save changes' : 'Create product'}
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

export function ProdSiteDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean
  editing: SiteRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [kind, setKind] = useState<'facility' | 'lab'>('facility')
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SiteInput>({
    resolver: zodResolver(siteSchema(kind)),
    defaultValues: { name: '', accreditation: '', accreditationExpires: '' },
  })

  useEffect(() => {
    if (!open) return
    if (editing) {
      setKind(editing.kind === 'lab' ? 'lab' : 'facility')
      reset({ name: editing.name, accreditation: editing.accreditation, accreditationExpires: editing.accreditationExpires })
    } else {
      setKind('facility')
      reset({ name: '', accreditation: '', accreditationExpires: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

  const submit = handleSubmit(async (v) => {
    try {
      if (editing) {
        await adminApi(`/api/admin/catalogue/sites/${encodeURIComponent(editing.id)}`, {
          method: 'PATCH',
          body: {
            name: v.name,
            accreditation: v.accreditation,
            accreditationExpires: v.accreditationExpires,
          },
        })
        toast(`${v.name} updated`, { description: 'Recorded in the audit log.' })
      } else {
        await adminApi('/api/admin/catalogue/sites', {
          method: 'POST',
          body: {
            kind,
            name: v.name,
            accreditation: v.accreditation,
            accreditationExpires: v.accreditationExpires,
          },
        })
        toast(`${v.name} created`, { description: 'Recorded in the audit log.' })
      }
      onSaved()
      onClose()
    } catch (e) {
      const msg = (e as Error).message
      if (msg.includes('already exists') || msg.includes('already uses that name')) setError('name', { message: msg })
      else toast(msg, { tone: 'error' })
    }
  })

  if (!open) return null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={editing ? 'Edit site' : 'Add site'}
        description={
          editing
            ? 'Changes are recorded in the audit log.'
            : 'Manufacturing facilities (GMP) and testing labs (NABL) both live here.'
        }
        className="max-w-xl"
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          {!editing && (
            <FormField id="st-kind" label="Kind">
              {(a) => (
                <NativeSelect {...a} value={kind} onChange={(e) => setKind(e.target.value === 'lab' ? 'lab' : 'facility')}>
                  <option value="facility">Manufacturing facility (GMP)</option>
                  <option value="lab">Testing lab (NABL)</option>
                </NativeSelect>
              )}
            </FormField>
          )}
          <FormField id="st-name" label="Name and city" error={errors.name?.message}>
            {(a) => <Input {...a} {...register('name')} maxLength={200} />}
          </FormField>
          <FormField
            id="st-accred"
            label={kind === 'lab' ? 'NABL certificate number' : 'GMP licence number'}
            error={errors.accreditation?.message}
          >
            {(a) => <Input {...a} {...register('accreditation')} maxLength={100} />}
          </FormField>
          <FormField
            id="st-exp"
            label="Accreditation expires"
            error={errors.accreditationExpires?.message}
            description="YYYY-MM-DD — must be in the future."
          >
            {(a) => <Input {...a} type="date" {...register('accreditationExpires')} />}
          </FormField>
          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {editing ? 'Save changes' : 'Create site'}
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

/** Confirmation for hard removal — the audit log records who removed what. */
export function ConfirmRemoveDialog({
  open,
  title,
  body,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  body: string
  onClose: () => void
  onConfirm: () => void
}) {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) setBusy(false)
  }, [open])
  if (!open) return null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description={body} className="max-w-md">
        <div className="flex gap-3">
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onConfirm()
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Remove
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
      </DialogContent>
    </Dialog>
  )
}

