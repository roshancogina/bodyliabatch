import type { BatchRecord } from '../data/batches'
import type { Product } from '../data/products'
import type { AuditEvent } from '../data/admin-seed'

/** jsPDF's built-in fonts are WinAnsi only — map the few typographic glyphs we use. */
const safe = (s: string) =>
  s.replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[—–]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/→/g, '->').replace(/…/g, '...')

const BURGUNDY: [number, number, number] = [74, 31, 51]
const GRAPHITE: [number, number, number] = [50, 53, 50]
const MUTED: [number, number, number] = [110, 90, 76]
const GOLD: [number, number, number] = [180, 156, 134]

async function doc() {
  const { jsPDF } = await import('jspdf')
  return new jsPDF({ unit: 'mm', format: 'a4' })
}

/** Branded Certificate of Analysis for one batch. */
export async function downloadCertificate(record: BatchRecord, product: Product) {
  const pdf = await doc()
  const W = 210
  pdf.setFillColor(...BURGUNDY)
  pdf.rect(0, 0, W, 30, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('times', 'bold')
  pdf.setFontSize(20)
  pdf.text('bodylia', 18, 19)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text('CERTIFICATE OF ANALYSIS', W - 18, 19, { align: 'right' })

  pdf.setTextColor(...BURGUNDY)
  pdf.setFont('times', 'bold')
  pdf.setFontSize(22)
  pdf.text(safe(product.name), 18, 48)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(...MUTED)
  pdf.text(safe(`${product.claim} · ${product.format}`), 18, 55)

  const facts: [string, string][] = [
    ['Batch number', record.batch],
    ['Manufactured', record.manufactured],
    ['Expires', record.expires],
    ['Status', record.status === 'recalled' ? 'RECALLED - do not consume' : 'Released'],
    ['Manufactured at', record.facility],
    ['Tested by', record.lab],
  ]
  let y = 68
  pdf.setDrawColor(...GOLD)
  pdf.line(18, y - 5, W - 18, y - 5)
  facts.forEach(([k, v]) => {
    pdf.setTextColor(...MUTED)
    pdf.text(k, 18, y)
    pdf.setTextColor(...GRAPHITE)
    pdf.text(safe(v), 70, y)
    y += 7
  })

  y += 6
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(...BURGUNDY)
  pdf.setFontSize(12)
  pdf.text('Test results', 18, y)
  y += 7
  pdf.setFontSize(9)
  pdf.setTextColor(...MUTED)
  ;['Test', 'Specification', 'Result', 'Outcome'].forEach((h, i) => pdf.text(h, [18, 75, 130, 172][i], y))
  pdf.line(18, y + 2, W - 18, y + 2)
  y += 8
  pdf.setFont('helvetica', 'normal')
  record.coa.forEach((r) => {
    pdf.setTextColor(...GRAPHITE)
    pdf.text(safe(r.test), 18, y)
    pdf.text(safe(r.specification), 75, y)
    pdf.text(safe(r.result), 130, y)
    pdf.setTextColor(...(r.pass ? ([46, 125, 50] as [number, number, number]) : ([198, 40, 40] as [number, number, number])))
    pdf.text(r.pass ? 'PASS' : 'FAIL', 172, y)
    pdf.setDrawColor(227, 218, 210)
    pdf.line(18, y + 2.5, W - 18, y + 2.5)
    y += 8
  })

  pdf.setFontSize(8)
  pdf.setTextColor(...MUTED)
  pdf.text(safe(`Verified at batch.bodylia.in/?b=${record.batch} on ${new Date().toISOString().slice(0, 10)}. Results apply to this batch only.`), 18, 280)
  pdf.text('Dietary supplement. Not for medicinal use.', 18, 285)
  pdf.save(`${record.batch}-certificate.pdf`)
}

export async function exportAuditPdf(rows: AuditEvent[], from: string, to: string) {
  const pdf = await doc()
  pdf.setFont('times', 'bold')
  pdf.setFontSize(18)
  pdf.setTextColor(...BURGUNDY)
  pdf.text('Bodylia batch console - audit log', 14, 18)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(...MUTED)
  pdf.text(`${from} to ${to} · ${rows.length} events · exported ${new Date().toISOString()}`, 14, 25)
  let y = 35
  rows.forEach((r) => {
    if (y > 282) {
      pdf.addPage()
      y = 18
    }
    pdf.setTextColor(...MUTED)
    pdf.text(r.at.slice(0, 16).replace('T', ' '), 14, y)
    pdf.setTextColor(...GRAPHITE)
    pdf.text(safe(r.actor), 50, y)
    pdf.text(safe(`${r.action}${r.detail ? ` - ${r.detail}` : ''}`).slice(0, 70), 88, y)
    pdf.text(safe(r.target).slice(0, 26), 160, y)
    y += 6
  })
  pdf.save(`bodylia-audit-${from}-to-${to}.pdf`)
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
