/**
 * TypeScript mirror of the GET /api/admin/insights contract
 * (backend-go/handlers_admin_insights.go; pinned server-side by
 * backend-go/insights_test.go). Used by the production console Overview tab
 * (ProdOverview) — keep the two sides in step when adding fields.
 */

export interface InsightsChannel {
  channel: string
  total: number
  /** Confirmed counterfeit, or a batch number that was never registered. */
  suspected: number
}

export interface InsightsWorkload {
  name: string
  open: number
}

export interface InsightsEscalation {
  reference: string
  at: string
  by: string
  reason: string
  urgency: 'standard' | 'urgent'
}

export interface InsightsExpiring {
  batch: string
  productName: string
  expires: string
}

export interface InsightsDay {
  /** YYYY-MM-DD (UTC), oldest of the 14 buckets first. */
  day: string
  checks: number
  notFound: number
}

export interface InsightsHotspot {
  input: string
  checks7d: number
  checksPrev7d: number
  topChannel: string | null
  linkedReports: string[]
}

export interface InsightsInvited {
  name: string
  email: string
}

export interface AdminInsights {
  generatedAt: string
  replyTargetHours: number
  reports: {
    total: number
    open: number
    atRisk: number
    unassigned: number
    resolved: number
    resolvedCounterfeit: number
    suspectedCounterfeit: number
    byChannel: InsightsChannel[]
    workload: InsightsWorkload[]
  }
  escalations: {
    open: number
    oldest: InsightsEscalation | null
  }
  batches: {
    total: number
    recalled: number
    expiringSoon: InsightsExpiring[]
  }
  lookups14d: {
    total: number
    notFound: number
    days: InsightsDay[]
  }
  hotspots: InsightsHotspot[]
  staff: {
    active: number
    invited: InsightsInvited[]
  }
  service: {
    /** Share of resolved reports first answered within target; null = none resolved yet. */
    repliesOnTargetPct: number | null
  }
}
