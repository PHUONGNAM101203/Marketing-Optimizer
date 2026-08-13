import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Deployment, DeploymentStatus, KpiTarget, MarketingPlan, PlanItem } from '@/lib/domain/plan'
import type { CampaignObjective, PlanStatus } from '@/lib/domain/plan'
import type { ProviderId } from '@/lib/domain/providers'

interface PlanItemRow {
  readonly id: string
  readonly plan_id: string
  readonly provider: string
  readonly campaign_name: string
  readonly objective: string
  readonly budget_micros: number
  readonly start_date: string
  readonly end_date: string
  readonly kpi_targets: unknown
  readonly notes: string | null
}

interface PlanRow {
  readonly id: string
  readonly site_id: string
  readonly name: string
  readonly period_start: string
  readonly period_end: string | null
  readonly total_budget_micros: number
  readonly status: string
  readonly source: string
  readonly created_by: string | null
  readonly created_at: string
  readonly plan_items: readonly PlanItemRow[]
}

const toPlanItem = (row: PlanItemRow): PlanItem => ({
  id: row.id,
  planId: row.plan_id,
  provider: row.provider as ProviderId,
  campaignName: row.campaign_name,
  objective: row.objective as CampaignObjective,
  budgetMicros: row.budget_micros,
  startDate: row.start_date,
  endDate: row.end_date,
  kpiTargets: (row.kpi_targets as readonly KpiTarget[] | null) ?? [],
  notes: row.notes,
})

const toPlan = (row: PlanRow): MarketingPlan => ({
  id: row.id,
  siteId: row.site_id,
  name: row.name,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  totalBudgetMicros: row.total_budget_micros,
  status: row.status as PlanStatus,
  items: row.plan_items.map(toPlanItem),
  createdBy: row.created_by ?? '',
  source: row.source as MarketingPlan['source'],
  createdAt: row.created_at,
})

export const listPlans = async (siteId: string): Promise<readonly MarketingPlan[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plans')
    .select('*, plan_items(*)')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Không đọc được kế hoạch: ${error.message}`)
  return (data ?? []).map((row) => toPlan(row as unknown as PlanRow))
}

interface DeploymentRow {
  readonly id: string
  readonly site_id: string
  readonly plan_item_id: string | null
  readonly title: string
  readonly providers: readonly string[]
  readonly scheduled_at: string
  readonly status: string
  readonly owner: string
}

const toDeployment = (row: DeploymentRow): Deployment => ({
  id: row.id,
  siteId: row.site_id,
  planItemId: row.plan_item_id,
  title: row.title,
  providers: row.providers as readonly ProviderId[],
  scheduledAt: row.scheduled_at,
  status: row.status as DeploymentStatus,
  owner: row.owner,
})

export const listDeployments = async (siteId: string): Promise<readonly Deployment[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deployments')
    .select('*')
    .eq('site_id', siteId)
    .order('scheduled_at', { ascending: true })

  if (error) throw new Error(`Không đọc được lịch triển khai: ${error.message}`)
  return (data ?? []).map((row) => toDeployment(row as DeploymentRow))
}
