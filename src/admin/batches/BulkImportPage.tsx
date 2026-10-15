import React, { useState } from 'react'
import { ArrowLeft, CheckCircle2, Download, FileUp, XCircle } from 'lucide-react'
import type { StaffUser } from '../../data/admin-seed'
import { store, useStore } from '../../lib/store'
import { downloadCsv } from '../../lib/pdf'
import { toast } from '../../lib/toast'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/button'
import { Textarea } from '../../components/ui/input'
import { PageHeader } from '../PageHeader'
import { csvRowSchema } from '../schemas'
import type { Go } from '../AdminShell'

const HEADER = ['batch', 'product', 'manufactured', 'expires', 'facility', 'lab']
const OPTIONAL_HEADER = ['aliases']
const SAMPLE = `batch,product,manufactured,expires,facility,lab,aliases
BDL-FN-2601-0042,FN,2026-01-05,2028-01-04,"Unit 2, Baddi, Himachal Pradesh","Eurofins Analytical Services India, Bengaluru","FN-2601-42 | VND-FN-0042"
BDL-PD-2601-0007,PD,2026-01-08,2027-01-07,"Unit 1, Baddi, Himachal Pradesh","TÜV SÜD South Asia, Chennai",
BDL-MB-2601-0019,FR,2026-01-09,2028-01-08,"Unit 2, Baddi, Himachal Pradesh","Eurofins Analytical Services India, Bengaluru",
BDL-FR-2509-0312,FR,2025-09-14,2027-09-13,"Unit 2, Baddi, Himachal Pradesh","Eurofins Analytical Services India, Bengaluru","FR-2509-312 | VND-FR-0312"`

interface Row {
  line: number
  values: Record<string, string>
  errors: string[]
}

const STEPS = ['Upload', 'Check', 'Import']

export function BulkImportPage({ user, go }: { user: StaffUser; go: Go }) {
  const [step, setStep] = useState(0)
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [imported, setImported] = useState(0)
  const batches = useStore((s) => s.batches)
  const products = useStore((s) => s.products)
  const facilities = useStore((s) => s.facilities)
  const labs = useStore((s) => s.labs)

  const validate = () => {
    const lines = parseCsv(text.trim())
    if (lines.length < 2) return setParseError('Add a header row and at least one batch row, or upload a CSV file.')
    const head = lines[0].map((h) => h.trim().toLowerCase())
    const hasAliases = head.length === 7 && head[6] === 'aliases'
    if (!(HEADER.every((h, i) => head[i] === h) && (head.length === 6 || hasAliases)))
      return setParseError(`The first row must be exactly: ${HEADER.join(',')}${' — with optional trailing ,aliases'}`)
    if (lines.length > 501) return setParseError('Import up to 500 batches at a time.')
    setParseError(null)
    const seen = new Set<string>()
    const seenAliases = new Set<string>()
    const existingAliases = new Map<string, string>()
    for (const b of batches) {
      existingAliases.set(b.batch, b.batch)
      for (const a of b.aliases ?? []) existingAliases.set(a, b.batch)
    }
    setRows(
      lines.slice(1).map((cells, i) => {
        const keys = hasAliases ? [...HEADER, ...OPTIONAL_HEADER] : HEADER
        const values = Object.fromEntries(keys.map((h, j) => [h, (cells[j] ?? '').trim()]))
        const res = csvRowSchema.safeParse(values)
        const errors = res.success ? [] : res.error.issues.map((iss) => `${iss.path[0]}: ${iss.message}`)
        const b = values.batch.toUpperCase()
        if (batches.some((x) => x.batch === b)) errors.push('batch: Already registered.')
        if (seen.has(b)) errors.push('batch: Appears twice in this file.')
        seen.add(b)
        if (values.product && !products.some((p) => p.code === values.product.toUpperCase())) errors.push('product: Not in the catalogue.')
        if (values.facility && !facilities.some((f) => f.name === values.facility && !f.archived)) errors.push('facility: Not an active facility in the catalogue.')
        if (values.lab && !labs.some((l) => l.name === values.lab && !l.archived)) errors.push('lab: Not an active lab in the catalogue.')
        // Alias cross-checks: globally unique + not clashing within the file.
        if (res.success) {
          for (const a of res.data.aliases ?? []) {
            if (existingAliases.has(a)) errors.push(`aliases: "${a}" is already used by ${existingAliases.get(a)}.`)
            else if (seenAliases.has(a)) errors.push(`aliases: "${a}" appears twice in this file.`)
            else if (a === b) errors.push(`aliases: "${a}" repeats the batch number.`)
            seenAliases.add(a)
          }
        }
        return { line: i + 2, values, errors }
      }),
    )
    setStep(1)
  }

  const bad = rows.filter((r) => r.errors.length)

  const doImport = () => {
    const newRecords = rows.map((r) => {
      const parsed = csvRowSchema.safeParse(r.values)
      return {
        batch: r.values.batch.toUpperCase(),
        product: r.values.product.toUpperCase(),
        manufactured: r.values.manufactured,
        expires: r.values.expires,
        facility: r.values.facility,
        lab: r.values.lab,
        status: 'released' as const,
        coa: [],
        aliases: parsed.success ? (parsed.data.aliases ?? []) : [],
      }
    })
    store.set((s) => ({ batches: [...newRecords, ...s.batches] }))
    store.audit(user.name, 'Bulk imported batches', `${newRecords.length} batches`, newRecords.map((r) => r.batch).join(', '))
    setImported(newRecords.length)
    setStep(2)
    toast(`${newRecords.length} batches imported`)
  }

  return (
    <div>
      <button onClick={() => go('batches')} className="-ml-1 mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-burgundy">
        <ArrowLeft className="size-4" aria-hidden="true" /> Batches
      </button>
      <PageHeader title="Bulk import batches" description="Register up to 500 released batches from one CSV. Nothing is saved unless every row passes." />

      <ol className="mt-6 flex gap-2" aria-label="Import steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className="flex flex-1 flex-col gap-1.5">
            <span className={cn('h-1.5 rounded-full', i <= step ? 'bg-burgundy' : 'bg-mist')} aria-hidden="true" />
            <span className={cn('text-sm', i === step ? 'font-semibold text-graphite' : 'text-muted')}>
              {s}
              <span className="sr-only">{i < step ? ' — done' : i === step ? ' — current step' : ''}</span>
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="csv-file" className="text-sm font-semibold">Upload a CSV file</label>
              <input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) setText(await f.text())
                }}
                className="flex min-h-11 w-full rounded-md border border-taupe bg-white px-3 py-1.5 text-base text-graphite file:mr-3 file:rounded file:border-0 file:bg-sand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-burgundy"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="csv-text" className="text-sm font-semibold">…or paste the rows</label>
              <p id="csv-desc" className="text-sm text-muted">The first row must be the header: {HEADER.join(',')} — with optional trailing ,aliases (pipe-separated vendor codes).</p>
              <Textarea id="csv-text" aria-describedby={parseError ? 'csv-desc csv-err' : 'csv-desc'} aria-invalid={!!parseError} value={text} onChange={(e) => setText(e.target.value)} className="tabular min-h-56 text-sm" />
              {parseError && <p id="csv-err" className="text-sm font-medium text-error">{parseError}</p>}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={validate} disabled={!text.trim()}>
                <FileUp aria-hidden="true" />
                Check rows
              </Button>
              <Button variant="ghost" onClick={() => setText(SAMPLE)}>Use preview sample</Button>
            </div>
          </div>
          <aside className="rounded-lg bg-sand p-6 text-graphite">
            <h2 className="font-semibold">Before you import</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
              <li>Only include batches that passed release testing.</li>
              <li>Dates as YYYY-MM-DD. Facility and lab names must match the catalogue exactly.</li>
              <li>Lab results aren’t part of the CSV — add them per batch afterwards, or customers see “results pending”.</li>
            </ul>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => downloadCsv('bodylia-batch-import-template.csv', [HEADER, ['BDL-FR-2601-0001', 'FR', '2026-01-15', '2028-01-14', facilities[0]?.name ?? '', labs[0]?.name ?? '']])}
            >
              <Download aria-hidden="true" />
              Download template
            </Button>
          </aside>
        </section>
      )}

      {step === 1 && (
        <section className="mt-8" aria-labelledby="check-title">
          <h2 id="check-title" className={cn('text-xl font-semibold', bad.length ? 'text-error' : 'text-success')} tabIndex={-1}>
            {bad.length ? `${bad.length} of ${rows.length} rows need fixing before anything can be imported` : `All ${rows.length} rows are valid`}
          </h2>
          <div role="region" aria-label="Validation result per CSV row (scrolls sideways on small screens)" tabIndex={0} className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Validation result per CSV row</caption>
              <thead>
                <tr className="border-b border-gold text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">Line</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Batch</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Product</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Dates</th>
                  <th scope="col" className="py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={cn('border-b border-mist align-top', r.errors.length && 'bg-error-bg')}>
                    <td className="tabular py-2.5 pr-3 text-muted">{r.line}</td>
                    <th scope="row" className="tabular py-2.5 pr-3 font-semibold text-graphite">{r.values.batch}</th>
                    <td className="py-2.5 pr-3 text-graphite">{r.values.product}</td>
                    <td className="tabular py-2.5 pr-3 text-graphite">{r.values.manufactured} → {r.values.expires}</td>
                    <td className="py-2.5">
                      {r.errors.length === 0 ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-success"><CheckCircle2 className="size-4" aria-hidden="true" />Ready</span>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {r.errors.map((e) => (
                            <li key={e} className="flex items-start gap-1.5 text-error"><XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{e}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setStep(0)}>Back and fix</Button>
            <Button onClick={doImport} disabled={bad.length > 0}>Import {rows.length} batches</Button>
          </div>
          {bad.length > 0 && <p className="mt-2 text-sm text-muted">Partial imports are blocked so the register never ends up half-updated.</p>}
        </section>
      )}

      {step === 2 && (
        <section className="mt-8 max-w-xl" role="status">
          <CheckCircle2 className="size-10 text-success" strokeWidth={1.75} aria-hidden="true" />
          <h2 className="mt-3 font-serif text-2xl font-semibold text-burgundy">{imported} batches registered</h2>
          <p className="mt-2 text-graphite">They’re live for customers now. Next, add lab results to each so the certificate shows real data.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => go('batches')}>Go to batches</Button>
            <Button variant="outline" onClick={() => { setText(''); setRows([]); setStep(0) }}>Import another file</Button>
          </div>
        </section>
      )}
    </div>
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
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); out.push(row); row = []; cell = ''
    } else cell += c
  }
  row.push(cell)
  out.push(row)
  return out.filter((r) => r.some((c) => c.trim()))
}
