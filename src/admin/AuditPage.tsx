import React, { useState } from 'react'
import { format, subDays } from 'date-fns'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Download } from 'lucide-react'
import type { StaffUser } from '../data/admin-seed'
import { store, useStore } from '../lib/store'
import { can } from '../lib/auth'
import { downloadCsv, exportAuditPdf } from '../lib/pdf'
import { toast } from '../lib/toast'
import { Button } from '../components/ui/button'
import { Input, NativeSelect } from '../components/ui/input'
import { FormField } from '../components/ui/form-field'
import { Dialog, DialogContent } from '../components/ui/dialog'
import { PageHeader } from './PageHeader'
import { auditExportSchema, type AuditExportInput } from './schemas'

const ACTION_GROUPS: Record<string, (a: string) => boolean> = {
  'Batches & recalls': (a) => /batch|recall|import/i.test(a),
  Reports: (a) => /report|escalat|replied/i.test(a),
  'Staff & access': (a) => /sign|role|invit|activat|password|recovery|account|profile/i.test(a),
  'Catalogue & settings': (a) => /product|facility|lab|setting/i.test(a),
}

export function AuditPage({ user }: { user: StaffUser }) {
  const audit = useStore((s) => s.audit)
  const [actor, setActor] = useState('all')
  const [group, setGroup] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const actors = [...new Set(audit.map((a) => a.actor))]
  const rows = audit
    .filter((a) => actor === 'all' || a.actor === actor)
    .filter((a) => group === 'all' || ACTION_GROUPS[group](a.action))
    .filter((a) => !from || a.at.slice(0, 10) >= from)
    .filter((a) => !to || a.at.slice(0, 10) <= to)

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every change in the console, newest first. Kept for 7 years; entries can’t be edited or deleted."
        actions={
          can(user, 'audit.export') && (
            <Button variant="outline" onClick={() => setExporting(true)}>
              <Download aria-hidden="true" />
              Export for auditors
            </Button>
          )
        }
      />
      <div role="search" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="au-actor" className="text-sm font-semibold">Person</label>
          <NativeSelect id="au-actor" value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="all">Everyone</option>
            {actors.map((a) => <option key={a}>{a}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="au-group" className="text-sm font-semibold">Type of change</label>
          <NativeSelect id="au-group" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="all">All changes</option>
            {Object.keys(ACTION_GROUPS).map((g) => <option key={g}>{g}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="au-from" className="text-sm font-semibold">From</label>
          <Input id="au-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="au-to" className="text-sm font-semibold">To</label>
          <Input id="au-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <p className="mt-5 text-sm text-muted" aria-live="polite">{rows.length} of {audit.length} events</p>
      <div role="region" aria-label="Audit events, newest first (scrolls sideways on small screens)" tabIndex={0} className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <caption className="sr-only">Audit events, newest first</caption>
          <thead>
            <tr className="border-b border-gold text-muted">
              <th scope="col" className="py-2.5 pr-4 font-medium">When</th>
              <th scope="col" className="py-2.5 pr-4 font-medium">Who</th>
              <th scope="col" className="py-2.5 pr-4 font-medium">Action</th>
              <th scope="col" className="py-2.5 font-medium">Record</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-mist align-top">
                <td className="tabular whitespace-nowrap py-3 pr-4 text-muted">{format(new Date(a.at), 'd MMM yyyy, HH:mm')}</td>
                <td className="py-3 pr-4 text-graphite">{a.actor}</td>
                <th scope="row" className="py-3 pr-4 font-semibold text-graphite">
                  {a.action}
                  {a.detail && <span className="block max-w-md font-normal text-muted">{a.detail}</span>}
                </th>
                <td className="tabular py-3 text-graphite">{a.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-graphite">No events match these filters.</p>}
      </div>
      <ExportDialog open={exporting} onOpenChange={setExporting} user={user} />
    </div>
  )
}

function ExportDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: StaffUser }) {
  const audit = useStore((s) => s.audit)
  const today = format(new Date(), 'yyyy-MM-dd')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuditExportInput>({ resolver: zodResolver(auditExportSchema), defaultValues: { from: format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: today, format: 'csv' } })

  const submit = handleSubmit(async (v) => {
    const rows = audit.filter((a) => a.at.slice(0, 10) >= v.from && a.at.slice(0, 10) <= v.to)
    if (v.format === 'csv') downloadCsv(`bodylia-audit-${v.from}-to-${v.to}.csv`, [['at', 'actor', 'action', 'target', 'detail'], ...rows.map((r) => [r.at, r.actor, r.action, r.target, r.detail ?? ''])])
    else await exportAuditPdf(rows, v.from, v.to)
    store.audit(user.name, 'Exported audit log', 'Audit log', `${rows.length} events, ${v.from} to ${v.to}, ${v.format.toUpperCase()}`)
    toast('Audit export downloaded', { description: `${rows.length} events` })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Export the audit log" description="The export itself is recorded in the audit log." className="max-w-lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="ex-from" label="From" error={errors.from?.message}>
              {(a) => <Input {...a} {...register('from')} type="date" />}
            </FormField>
            <FormField id="ex-to" label="To" error={errors.to?.message}>
              {(a) => <Input {...a} {...register('to')} type="date" />}
            </FormField>
          </div>
          <fieldset>
            <legend className="text-sm font-semibold">Format</legend>
            <div className="mt-2 flex gap-3">
              {[['csv', 'CSV (spreadsheet)'], ['pdf', 'PDF (signed-off record)']].map(([v, l]) => (
                <label key={v} className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-md border border-stone px-3 has-[:checked]:border-burgundy has-[:checked]:bg-sand">
                  <input type="radio" value={v} {...register('format')} className="size-5 accent-[#4a1f33]" />
                  <span className="text-sm text-graphite">{l}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Download export</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
