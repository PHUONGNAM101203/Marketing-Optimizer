import { notFound } from 'next/navigation'
import { Bot, Trash2, TriangleAlert } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { Card, CardBody, CardHeader, SectionHead } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { ProviderMark } from '@/components/connections/provider-mark'
import { NewPlanDialog } from '@/components/planner/new-plan-dialog'
import { AddPlanItemDialog } from '@/components/planner/add-plan-item-dialog'
import { EditPlanPeriodDialog } from '@/components/planner/edit-plan-period-dialog'
import { PlanStatusSelect, DeploymentStatusSelect } from '@/components/planner/status-select'
import { deletePlanItemAction } from '@/lib/actions/plans'
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableScroller,
} from '@/components/ui/table'
import { getSite } from '@/lib/data/sites'
import { listDeployments, listPlans } from '@/lib/data/plans'
import {
  OBJECTIVE_LABELS,
  isOverBudget,
  sumItemBudgets,
  type MarketingPlan,
} from '@/lib/domain/plan'
import { PROVIDER_META } from '@/lib/domain/providers'
import { formatCurrencyCompact, formatDate, formatDateTime, formatPercent } from '@/lib/format'

export const metadata = { title: 'Kế hoạch' }

export default async function PlannerPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>
}) {
  const { siteId } = await params
  const site = await getSite(siteId)
  if (!site) notFound()

  const [plans, deployments] = await Promise.all([listPlans(site.id), listDeployments(site.id)])
  const blocked = deployments.filter((item) => item.status === 'blocked')
  const now = new Date()

  return (
    <PageShell>
      <PageHeader
        title="Kế hoạch"
        description="Phân bổ ngân sách theo giai đoạn và lịch triển khai. Kế hoạch nào do AI sinh đều ghi rõ căn cứ lấy từ số liệu thật nào."
        action={<NewPlanDialog siteId={site.id} currency={site.currency} timezone={site.timezone} />}
      />

      <DataGate
        siteId={site.id}
        title="Chưa có căn cứ để lập kế hoạch"
        description="Kế hoạch ngân sách dựa trên hiệu suất thật của kỳ trước. Kết nối trước, lên kế hoạch sau."
      >

      {blocked.length > 0 ? (
        <Callout
          tone="critical"
          icon={<TriangleAlert aria-hidden className="size-5 text-[var(--color-negative)]" />}
          title={`${blocked.length} mục triển khai đang bị chặn`}
        >
          <ul className="list-inside list-disc">
            {blocked.map((item) => (
              <li key={item.id}>
                {item.title} — dự kiến {formatDate(item.scheduledAt)}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {plans.length === 0 ? (
        <EmptyState
          title="Chưa có kế hoạch nào"
          description={`Bấm "Kế hoạch mới" ở trên để bắt đầu phân bổ ngân sách cho ${site.domain}.`}
        />
      ) : (
        plans.map((plan) => (
          <PlanSection key={plan.id} plan={plan} currency={site.currency} timezone={site.timezone} siteId={site.id} />
        ))
      )}

      <section className="flex flex-col gap-4">
        <SectionHead
          label="Lịch"
          title="Sắp triển khai"
          description="Cái gì lên sóng lúc nào, ở kênh nào, ai chịu trách nhiệm."
        />

        {deployments.length === 0 ? (
          <EmptyState
            title="Chưa có gì trên lịch"
            description="Lịch triển khai tự thêm khi bạn thêm một mục ngân sách vào kế hoạch."
          />
        ) : (
          <Card>
            <ol className="divide-y divide-[var(--color-rule)]">
              {deployments.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <div className="w-24 shrink-0">
                    <p
                      data-numeric
                      className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]"
                    >
                      {formatDate(item.scheduledAt)}
                    </p>
                    <p className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
                      {new Date(item.scheduledAt) < now ? 'Đã qua hạn' : 'Sắp tới'}
                    </p>
                  </div>

                  <DeploymentStatusSelect deploymentId={item.id} siteId={site.id} status={item.status} />

                  <span className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] text-[var(--color-ink)]">
                    {item.title}
                  </span>

                  <span className="flex shrink-0 items-center gap-1">
                    {item.providers.map((provider) => (
                      <ProviderMark key={provider} provider={provider} size="sm" />
                    ))}
                  </span>

                  <span className="shrink-0 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                    {item.owner}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </section>
      </DataGate>
    </PageShell>
  )
}

function PlanSection({
  plan,
  currency,
  timezone,
  siteId,
}: {
  readonly plan: MarketingPlan
  readonly currency: string
  readonly timezone: string
  readonly siteId: string
}) {
  const allocated = sumItemBudgets(plan.items)
  const over = isOverBudget(plan)
  const usage = plan.totalBudgetMicros === 0 ? null : allocated / plan.totalBudgetMicros

  return (
    <Card>
      <CardHeader
        title={plan.name}
        description={`Bắt đầu ${formatDateTime(plan.periodStart, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${plan.periodEnd ? ` – kết thúc ${formatDateTime(plan.periodEnd, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ' — kế hoạch mở, chưa đặt ngày kết thúc'}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {plan.source === 'ai' ? (
              <Badge tone="signal" icon={<Bot aria-hidden className="size-3" />}>
                AI sinh
              </Badge>
            ) : null}
            <PlanStatusSelect planId={plan.id} siteId={siteId} status={plan.status} />
            <EditPlanPeriodDialog planId={plan.id} siteId={siteId} periodEnd={plan.periodEnd} />
            <AddPlanItemDialog planId={plan.id} siteId={siteId} currency={currency} timezone={timezone} />
          </div>
        }
        ruled
      />

      <CardBody className="pt-4">
        <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <dt className="text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
              Tổng ngân sách
            </dt>
            <dd
              data-numeric
              className="text-[length:var(--text-xl)] font-semibold text-[var(--color-ink)]"
            >
              {formatCurrencyCompact(plan.totalBudgetMicros, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
              Đã phân bổ
            </dt>
            <dd
              data-numeric
              className={`text-[length:var(--text-xl)] font-semibold ${
                over ? 'text-[var(--color-negative)]' : 'text-[var(--color-ink)]'
              }`}
            >
              {formatCurrencyCompact(allocated, currency)}
              <span className="ml-2 text-[length:var(--text-sm)] font-normal text-[var(--color-ink-3)]">
                {formatPercent(usage, 0)}
              </span>
            </dd>
          </div>
        </dl>

        {over ? (
          <p className="mb-4 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-negative-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]">
            <TriangleAlert
              aria-hidden
              className="size-4 shrink-0 text-[var(--color-negative)]"
            />
            Tổng các mục vượt ngân sách kế hoạch{' '}
            <strong data-numeric>
              {formatCurrencyCompact(allocated - plan.totalBudgetMicros, currency)}
            </strong>
            .
          </p>
        ) : null}

        {plan.items.length === 0 ? (
          <EmptyState
            title="Chưa có mục ngân sách nào"
            description={`Bấm "Thêm mục" ở trên để phân bổ ngân sách cho một chiến dịch cụ thể.`}
            className="py-8"
          />
        ) : (
          <TableScroller aria-label={`Các mục của ${plan.name}`}>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Chiến dịch</TH>
                  <TH>Kênh</TH>
                  <TH>Mục tiêu</TH>
                  <TH numeric>Ngân sách</TH>
                  <TH numeric>Tỷ trọng</TH>
                  <TH>Thời gian</TH>
                  <TH>KPI</TH>
                  <TH aria-label="Xoá" />
                </TR>
              </THead>
              <TBody>
                {plan.items.map((item) => (
                  <TR key={item.id}>
                    <TD className="max-w-[18rem]">
                      <span className="block truncate">{item.campaignName}</span>
                      {item.notes ? (
                        <span className="block truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                          {item.notes}
                        </span>
                      ) : null}
                    </TD>
                    <TD>
                      <span className="flex items-center gap-1.5">
                        <ProviderMark provider={item.provider} size="sm" />
                        <span className="truncate">
                          {PROVIDER_META[item.provider].shortLabel}
                        </span>
                      </span>
                    </TD>
                    <TD>{OBJECTIVE_LABELS[item.objective]}</TD>
                    <TD numeric>{formatCurrencyCompact(item.budgetMicros, currency)}</TD>
                    <TD numeric>
                      {formatPercent(
                        allocated === 0 ? null : item.budgetMicros / allocated,
                        0,
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {formatDateTime(item.startDate)} – {formatDateTime(item.endDate)}
                    </TD>
                    <TD className="max-w-[16rem]">
                      <span
                        className="block truncate"
                        title={item.kpiTargets
                          .map((target) =>
                            target.unit === 'ratio'
                              ? `${target.metric} ≥ ${target.target}x`
                              : `${target.metric} ≥ ${new Intl.NumberFormat('vi-VN').format(target.target)}`,
                          )
                          .join(' · ')}
                      >
                        {item.kpiTargets
                          .map((target) =>
                            target.unit === 'ratio'
                              ? `${target.metric} ≥ ${target.target}x`
                              : `${target.metric} ≥ ${new Intl.NumberFormat('vi-VN').format(target.target)}`,
                          )
                          .join(' · ')}
                      </span>
                    </TD>
                    <TD>
                      <form action={deletePlanItemAction}>
                        <input type="hidden" name="planItemId" value={item.id} />
                        <input type="hidden" name="siteId" value={siteId} />
                        <Button type="submit" variant="ghost" size="icon" aria-label={`Xoá ${item.campaignName}`}>
                          <Trash2 aria-hidden className="size-3.5 text-[var(--color-negative)]" />
                        </Button>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroller>
        )}
      </CardBody>
    </Card>
  )
}
