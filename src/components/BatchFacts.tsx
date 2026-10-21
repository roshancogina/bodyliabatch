import React from 'react'
import { differenceInMonths, format } from 'date-fns'
import { Download, FileText, Flag } from 'lucide-react'
import type { BatchRecord } from '../data/batches'
import type { Product } from '../data/products'
import type { LookupResult } from '../lib/bff'
import { Button } from './ui/button'
import { LabReportDialog } from './LabReportDialog'
import { downloadCertificate } from '../lib/pdf'
import { batchCoaUrl } from '../lib/bff'
import { toast } from '../lib/toast'
import { SUPPORT_EMAIL } from '../data/catalog-static'

interface Props {
  record: BatchRecord
  product: Product
  kind: LookupResult['kind']
  onReport: () => void
}

export function BatchFacts({ record, product, kind, onReport }: Props) {
  const supportEmail = SUPPORT_EMAIL
  const now = new Date()
  const expires = new Date(record.expires)
  const monthsLeft = differenceInMonths(expires, now)
  const fmt = (iso: string) => format(new Date(iso), 'd MMM yyyy')

  const rows: [string, React.ReactNode][] = [
    ['Product', <><span className="font-semibold">{product.name}</span><span className="block text-sm text-muted">{product.format}</span></>],
    ['Manufactured', fmt(record.manufactured)],
    ['Expires', fmt(record.expires)],
    ['Shelf life left', kind === 'expired' ? 'None — expired' : monthsLeft < 1 ? 'Less than a month' : `${monthsLeft} months`],
    ...(record.qty != null ? [['Pack quantity', String(record.qty)] as [string, React.ReactNode]] : []),
    ...(record.mrp != null ? [['MRP', `₹${record.mrp.toLocaleString('en-IN')}`] as [string, React.ReactNode]] : []),
    ['Made at', record.facility],
    ['Tested by', record.lab],
    ...(record.coaFileName ? [['Lab certificate', `Signed certificate on file (${record.coaFileName})`] as [string, React.ReactNode]] : []),
  ]

  return (
    <div>
      <h2 className="font-serif text-3xl font-semibold leading-tight text-burgundy">{product.name}</h2>
      <p className="mt-1 text-graphite">{product.claim}</p>

      {kind === 'recalled' && record.recallReason && (
        <div className="mt-6 rounded-md bg-error-bg p-4 text-graphite">
          <h3 className="font-semibold text-error">Why it was recalled</h3>
          <p className="mt-1">{record.recallReason}</p>
          <p className="mt-2 text-sm">
            Email <a className="font-semibold text-burgundy underline underline-offset-4" href={`mailto:${supportEmail}?subject=Recall ${record.batch}`}>{supportEmail}</a> with a photo of the pack for a replacement or refund.
          </p>
        </div>
      )}

      <dl className="mt-6 border-t border-gold/60">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 border-b border-mist py-3.5 sm:grid-cols-[11rem_1fr] sm:gap-6">
            <dt className="text-sm font-medium text-muted">{k}</dt>
            <dd className="tabular text-graphite">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <LabReportDialog record={record} productName={product.name}>
          <Button size="lg">
            <FileText aria-hidden="true" />
            View lab report
          </Button>
        </LabReportDialog>
        <Button
          variant="outline"
          size="lg"
          onClick={async () => {
            try {
              const res = await fetch(batchCoaUrl(record.batch))
              if (res.ok) {
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = record.coaFileName || `${record.batch}-certificate.pdf`
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
                toast('Certificate downloaded', { description: a.download })
                return
              }
            } catch {
              // fallback to client-side pdf generator if offline/mock
            }
            await downloadCertificate(record, product)
            toast('Certificate downloaded', { description: `${record.batch}-certificate.pdf` })
          }}
        >
          <Download aria-hidden="true" />
          Download certificate (PDF)
        </Button>
        {kind !== 'genuine' && (
          <Button variant="ghost" size="lg" onClick={onReport}>
            <Flag aria-hidden="true" />
            Report this pack
          </Button>
        )}
      </div>
    </div>
  )
}

