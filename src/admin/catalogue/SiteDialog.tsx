import React, { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Site, StaffUser } from '../../data/admin-seed'
import { store } from '../../lib/store'
import { toast } from '../../lib/toast'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { FormField } from '../../components/ui/form-field'
import { siteSchema, type SiteInput } from '../schemas'

export function SiteDialog({ user, editing, onClose }: { user: StaffUser; editing: { kind: 'facility' | 'lab'; site: Site | 'new' } | null; onClose: () => void }) {
  const kind = editing?.kind ?? 'facility'
  const schema = useMemo(() => siteSchema(kind), [kind])
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SiteInput>({ resolver: zodResolver(schema), defaultValues: { name: '', accreditation: '', accreditationExpires: '' } })

  useEffect(() => {
    if (!editing) return
    const s = editing.site
    reset(s === 'new' ? { name: '', accreditation: '', accreditationExpires: '' } : { name: s.name, accreditation: s.accreditation ?? '', accreditationExpires: s.accreditationExpires ?? '' })
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editing) return null
  const isNew = editing.site === 'new'
  const key = kind === 'facility' ? 'facilities' : 'labs'
  const noun = kind === 'facility' ? 'facility' : 'testing lab'

  const submit = handleSubmit((v) => {
    store.set((s) => ({
      [key]: isNew
        ? [...s[key], { id: `${kind[0]}${Date.now()}`, ...v, archived: false }]
        : s[key].map((x) => (x.id === (editing.site as Site).id ? { ...x, ...v } : x)),
    }))
    store.audit(user.name, isNew ? `Added ${kind}` : `Edited ${kind}`, v.name, v.accreditation)
    toast(isNew ? `${noun[0].toUpperCase() + noun.slice(1)} added` : 'Saved', { description: v.name })
    onClose()
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={isNew ? `Add a ${noun}` : `Edit ${noun}`} description={kind === 'lab' ? 'Only NABL-accredited labs can release batches.' : 'Only GMP-licensed sites can manufacture batches.'} className="max-w-lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <FormField id="st-name" label="Name and city" error={errors.name?.message}>
            {(a) => <Input {...a} {...register('name')} />}
          </FormField>
          <FormField id="st-acc" label={kind === 'lab' ? 'NABL certificate number' : 'GMP licence number'} error={errors.accreditation?.message}>
            {(a) => <Input {...a} {...register('accreditation')} className="tabular" />}
          </FormField>
          <FormField id="st-exp" label="Valid until" description="We’ll warn quality 8 months before it lapses." error={errors.accreditationExpires?.message}>
            {(a) => <Input {...a} {...register('accreditationExpires')} type="date" />}
          </FormField>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{isNew ? `Add ${noun}` : 'Save changes'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
