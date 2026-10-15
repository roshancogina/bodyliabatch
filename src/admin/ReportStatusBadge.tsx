import React from 'react'
import { STATUS_LABEL, type ReportStatus } from '../data/admin-seed'
import { Badge } from '../components/ui/badge'

const TONE = {
  new: 'brand',
  investigating: 'info',
  resolved_genuine: 'success',
  resolved_counterfeit: 'error',
} as const

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>
}
