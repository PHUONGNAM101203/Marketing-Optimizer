import { StatRow, StatTile } from '@/components/ui/stat-tile'
import { Card, SectionHead } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { TBody, TD, TH, THead, TR, Table, TableScroller } from '@/components/ui/table'
import { formatCompact, formatCurrencyCompact } from '@/lib/format'
import type {
  KlaviyoCampaign,
  KlaviyoFlow,
  KlaviyoList,
  KlaviyoSegment,
  KlaviyoValuesRow,
} from '@/lib/providers/klaviyo'

/* Hallmark · component: klaviyo-dashboard · theme: studied-DNA (Ink & Signal)
 *
 * Số liệu hiệu suất (campaignPerformance/flowPerformance) đã cache 6 giờ ở
 * tầng data (`site-channel-detail.ts`) vì Klaviyo Reporting API giới hạn
 * 225 request/ngày — component này KHÔNG tự gọi lại gì, chỉ render những gì
 * đã fetch sẵn.
 */

export interface KlaviyoDashboardProps {
  readonly campaigns: readonly KlaviyoCampaign[]
  readonly flows: readonly KlaviyoFlow[]
  readonly campaignPerformance: readonly KlaviyoValuesRow[] | null
  readonly flowPerformance: readonly KlaviyoValuesRow[] | null
  readonly performanceError: string | null
  readonly profileCount: number | null
  readonly profileCountTruncated: boolean
  readonly segments: readonly KlaviyoSegment[]
  readonly lists: readonly KlaviyoList[]
  readonly currency: string
}

export function KlaviyoDashboard({
  campaigns,
  flows,
  campaignPerformance,
  flowPerformance,
  performanceError,
  profileCount,
  profileCountTruncated,
  segments,
  lists,
  currency,
}: KlaviyoDashboardProps) {
  const campaignPerformanceById = new Map((campaignPerformance ?? []).map((row) => [row.groupId, row]))
  const flowPerformanceById = new Map((flowPerformance ?? []).map((row) => [row.groupId, row]))

  const totalRevenue =
    (campaignPerformance ?? []).reduce((sum, row) => sum + row.conversionValueMicros, 0) +
    (flowPerformance ?? []).reduce((sum, row) => sum + row.conversionValueMicros, 0)

  return (
    <div className="flex flex-col gap-6">
      <StatRow>
        <StatTile
          label="Khách hàng"
          value={profileCount === null ? '—' : `${formatCompact(profileCount)}${profileCountTruncated ? '+' : ''}`}
          metric="users"
          deltaPct={null}
          footnote={profileCountTruncated ? 'Danh sách lớn hơn số đọc được — số trên chỉ là một phần.' : undefined}
        />
        <StatTile label="Campaign" value={formatCompact(campaigns.length)} metric="conversions" deltaPct={null} />
        <StatTile label="Flow" value={formatCompact(flows.length)} metric="conversions" deltaPct={null} />
        <StatTile
          label="Doanh thu quy đổi"
          value={formatCurrencyCompact(totalRevenue, currency)}
          metric="revenueMicros"
          deltaPct={null}
          footnote="Cộng dồn từ report campaign + flow trong khoảng ngày đang chọn."
        />
      </StatRow>

      {performanceError ? (
        <Callout tone="critical" title="Không lấy được số liệu hiệu suất">
          <p className="font-mono text-[length:var(--text-xs)] break-all">{performanceError}</p>
        </Callout>
      ) : null}

      <PerformanceTable
        label="Campaign"
        title="Hiệu suất campaign"
        rows={campaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          meta: `${campaign.channel === 'email' ? 'Email' : 'SMS'} · ${campaign.status}`,
          performance: campaignPerformanceById.get(campaign.id) ?? null,
        }))}
        currency={currency}
      />

      <PerformanceTable
        label="Flow"
        title="Hiệu suất flow"
        rows={flows.map((flow) => ({
          id: flow.id,
          name: flow.name,
          meta: `${flow.triggerType ?? 'Không rõ trigger'} · ${flow.status}`,
          performance: flowPerformanceById.get(flow.id) ?? null,
        }))}
        currency={currency}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <NameList
          label="Segment"
          title="Segment"
          items={segments.map((segment) => ({
            id: segment.id,
            name: segment.name,
            badge: segment.isActive ? 'Đang hoạt động' : 'Tạm dừng',
          }))}
        />
        <NameList
          label="List"
          title="Danh sách (List)"
          items={lists.map((list) => ({ id: list.id, name: list.name }))}
        />
      </div>
    </div>
  )
}

interface PerformanceTableRow {
  readonly id: string
  readonly name: string
  readonly meta: string
  readonly performance: KlaviyoValuesRow | null
}

function PerformanceTable({
  label,
  title,
  rows,
  currency,
}: {
  readonly label: string
  readonly title: string
  readonly rows: readonly PerformanceTableRow[]
  readonly currency: string
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead label={label} title={title} />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="Chưa có gì" description={`Tài khoản Klaviyo chưa có ${label.toLowerCase()} nào.`} />
        ) : (
          <TableScroller aria-label={title}>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>{label}</TH>
                  <TH numeric>Người nhận</TH>
                  <TH numeric>Mở</TH>
                  <TH numeric>Click</TH>
                  <TH numeric>Chuyển đổi</TH>
                  <TH numeric>Doanh thu</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id}>
                    <TD className="max-w-[20rem]">
                      <span className="block truncate font-medium" title={row.name}>
                        {row.name}
                      </span>
                      <span className="block truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                        {row.meta}
                      </span>
                    </TD>
                    <TD numeric>{row.performance ? formatCompact(row.performance.recipients) : '—'}</TD>
                    <TD numeric>{row.performance ? formatCompact(row.performance.opens) : '—'}</TD>
                    <TD numeric>{row.performance ? formatCompact(row.performance.clicks) : '—'}</TD>
                    <TD numeric>{row.performance ? formatCompact(row.performance.conversions) : '—'}</TD>
                    <TD numeric>
                      {row.performance ? formatCurrencyCompact(row.performance.conversionValueMicros, currency) : '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroller>
        )}
      </Card>
    </section>
  )
}

function NameList({
  label,
  title,
  items,
}: {
  readonly label: string
  readonly title: string
  readonly items: readonly { readonly id: string; readonly name: string; readonly badge?: string }[]
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead label={label} title={title} />
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <EmptyState title="Chưa có gì" description={`Tài khoản Klaviyo chưa có ${label.toLowerCase()} nào.`} />
        ) : (
          <ul className="divide-y divide-[var(--color-rule)]">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="truncate text-[length:var(--text-sm)] text-[var(--color-ink)]">{item.name}</span>
                {item.badge ? <Badge tone="outline">{item.badge}</Badge> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}
