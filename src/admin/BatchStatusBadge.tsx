import React from 'react'
import { AlertOctagon, CheckCircle2, Clock } from 'lucide-react'
import type { BatchRecord } from '../data/batches'
import { Badge } from '../components/ui/badge'

export function BatchStatusBadge({ b }: { b: BatchRecord }) {
  const s = batchState(b)
  if (s === 'recalled')
    return (
      <Badge tone="error">
        <AlertOctagon aria-hidden="true" /> Recalled
      </Badge>
    )
  if (s === 'expired')
    return (
      <Badge tone="warning">
        <Clock aria-hidden="true" /> Expired
      </Badge>
    )
  return (
    <Badge tone="success">
      <CheckCircle2 aria-hidden="true" /> In date
    </Badge>
  )
}

export function batchState(b: BatchRecord): 'recalled' | 'expired' | 'in_date' {
  if (b.status === 'recalled') return 'recalled'
  if (new Date(b.expires) < new Date()) return 'expired'
  return 'in_date'
}
