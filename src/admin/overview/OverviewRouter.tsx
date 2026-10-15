import React from 'react'
import type { StaffUser } from '../../data/admin-seed'
import type { Go } from '../AdminShell'
import { SupportQueue } from './SupportQueue'
import { QualityOverview } from './QualityOverview'
import { ExecutiveOverview } from './ExecutiveOverview'

/** Each role answers a different question on sign-in, so each gets its own overview. */
export function OverviewRouter({ user, go }: { user: StaffUser; go: Go }) {
  if (user.role === 'support') return <SupportQueue user={user} go={go} />
  if (user.role === 'quality') return <QualityOverview user={user} go={go} />
  return <ExecutiveOverview user={user} go={go} />
}
