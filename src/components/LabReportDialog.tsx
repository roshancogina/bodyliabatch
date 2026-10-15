import React from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { BatchRecord } from '../data/batches'
import { Dialog, DialogTrigger, DialogContent } from './ui/dialog'

export function LabReportDialog({
  record,
  productName,
  children,
}: {
  record: BatchRecord
  productName: string
  children: React.ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Lab report" description={`${productName} · batch ${record.batch} · ${record.lab}`}>
        {record.coa.length === 0 && (
          <p className="mb-4 rounded-md bg-info-bg p-3 text-sm text-graphite">
            This batch passed release testing. The detailed results are being added and will appear here shortly.
          </p>
        )}
        <div className={record.coa.length === 0 ? 'hidden' : '-mx-6 overflow-x-auto px-6'} role="region" aria-label="Lab results table" tabIndex={0}>
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="sr-only">Certificate of analysis results for batch {record.batch}</caption>
            <thead>
              <tr className="border-b border-gold/60 text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">Test</th>
                <th scope="col" className="py-2 pr-4 font-medium">Specification</th>
                <th scope="col" className="py-2 pr-4 font-medium">Result</th>
                <th scope="col" className="py-2 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {record.coa.map((r) => (
                <tr key={r.test} className="border-b border-mist">
                  <th scope="row" className="py-3 pr-4 font-semibold text-graphite">{r.test}</th>
                  <td className="py-3 pr-4 text-graphite">{r.specification}</td>
                  <td className="py-3 pr-4 text-graphite">{r.result}</td>
                  <td className="py-3">
                    {r.pass ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-success">
                        <CheckCircle2 className="size-4" aria-hidden="true" /> Pass
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-error">
                        <XCircle className="size-4" aria-hidden="true" /> Fail
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted">Results apply to this batch only. Methods per IP / USP monographs.</p>
      </DialogContent>
    </Dialog>
  )
}
