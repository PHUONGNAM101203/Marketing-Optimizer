import { ExternalLink } from 'lucide-react'
import { StatRow, StatTile } from '@/components/ui/stat-tile'
import { Card, SectionHead } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { TBody, TD, TH, THead, TR, Table, TableScroller } from '@/components/ui/table'
import { formatCompact, formatCurrency, formatCurrencyCompact, formatNumber } from '@/lib/format'
import { KLAVIYO_PROFILES_URL, klaviyoResourceUrl } from '@/lib/domain/klaviyo-web-links'
import type { KlaviyoCampaign, KlaviyoFlow, KlaviyoValuesRow } from '@/lib/providers/klaviyo'

const CAMPAIGN_CHANNEL_LABELS: Readonly<Record<KlaviyoCampaign['channel'], string>> = {
  email: 'Email',
  sms: 'SMS',
  mobile_push: 'Push',
}

/* Hallmark · component: klaviyo-dashboard · theme: studied-DNA (Ink & Signal)
 *
 * Số liệu hiệu suất (campaignPerformance/flowPerformance) đã cache 6 giờ ở
 * tầng data (`site-channel-detail.ts`) vì Klaviyo Reporting API giới hạn
 * 225 request/ngày — component này KHÔNG tự gọi lại gì, chỉ render những gì
 * đã fetch sẵn.
 */

export interface KlaviyoDashboardProps {
  readonly campaigns: readonly KlaviyoCampaign[]
  readonly campaignsTruncated: boolean
  readonly flows: readonly KlaviyoFlow[]
  readonly flowsTruncated: boolean
  readonly campaignPerformance: readonly KlaviyoValuesRow[] | null
  readonly flowPerformance: readonly KlaviyoValuesRow[] | null
  readonly performanceError: string | null
  readonly profileCount: number | null
  readonly profileCountTruncated: boolean
  /** Đơn vị tiền THẬT của tài khoản Klaviyo (`preferred_currency`), KHÔNG
   * phải `site.currency` — xem comment ở field `currency` trong
   * `ChannelDetail`'s klaviyo variant (`site-channel-detail.ts`). */
  readonly currency: string
  /** Mô tả khoảng ngày report này tính theo — khác nhau giữa tab "Tổng
   * quan" (theo bộ lọc ngày đầu trang) và "Toàn thời gian" (cố định 365
   * ngày gần nhất, không đổi theo bộ lọc). */
  readonly revenueScopeNote: string
}

export function KlaviyoDashboard({
  campaigns,
  campaignsTruncated,
  flows,
  flowsTruncated,
  campaignPerformance,
  flowPerformance,
  performanceError,
  profileCount,
  profileCountTruncated,
  currency,
  revenueScopeNote,
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
          footnote={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {profileCountTruncated ? <span>Danh sách lớn hơn số đọc được — số trên chỉ là một phần.</span> : null}
              <a
                href={KLAVIYO_PROFILES_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
              >
                <ExternalLink aria-hidden className="size-3" />
                Xem trong Klaviyo
              </a>
            </span>
          }
        />
        <StatTile label="Campaign" value={formatCompact(campaigns.length)} metric="conversions" deltaPct={null} />
        <StatTile label="Flow" value={formatCompact(flows.length)} metric="conversions" deltaPct={null} />
        <StatTile
          label="Doanh thu quy đổi"
          value={formatCurrencyCompact(totalRevenue, currency)}
          metric="revenueMicros"
          deltaPct={null}
          footnote={revenueScopeNote}
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
          meta: `${CAMPAIGN_CHANNEL_LABELS[campaign.channel]} · ${campaign.status}`,
          performance: campaignPerformanceById.get(campaign.id) ?? null,
          href: klaviyoResourceUrl('campaign', campaign.id),
        }))}
        currency={currency}
        truncated={campaignsTruncated}
      />

      <PerformanceTable
        label="Flow"
        title="Hiệu suất flow"
        rows={flows.map((flow) => ({
          id: flow.id,
          name: flow.name,
          meta: `${flow.triggerType ?? 'Không rõ trigger'} · ${flow.status}`,
          performance: flowPerformanceById.get(flow.id) ?? null,
          href: klaviyoResourceUrl('flow', flow.id),
        }))}
        currency={currency}
        truncated={flowsTruncated}
      />
    </div>
  )
}

interface PerformanceTableRow {
  readonly id: string
  readonly name: string
  readonly meta: string
  readonly performance: KlaviyoValuesRow | null
  readonly href: string
}

function PerformanceTable({
  label,
  title,
  rows,
  currency,
  truncated,
}: {
  readonly label: string
  readonly title: string
  readonly rows: readonly PerformanceTableRow[]
  readonly currency: string
  /** true nếu tài khoản có nhiều hơn số đã đọc được (giới hạn phân trang ở
   * `fetchKlaviyoCampaigns`/`fetchKlaviyoFlows`) — báo rõ thay vì âm thầm
   * thiếu, cùng quy ước với `profileCountTruncated`. */
  readonly truncated: boolean
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead label={label} title={title} />
      {truncated ? (
        <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
          Danh sách {label.toLowerCase()} lớn hơn số đọc được — bảng dưới chỉ là một phần.
        </p>
      ) : null}
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
                  <TH aria-label="Mở trong Klaviyo" />
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
                    <TD numeric>{row.performance ? formatNumber(row.performance.recipients) : '—'}</TD>
                    <TD numeric>{row.performance ? formatNumber(row.performance.opens) : '—'}</TD>
                    <TD numeric>{row.performance ? formatNumber(row.performance.clicks) : '—'}</TD>
                    <TD numeric>{row.performance ? formatNumber(row.performance.conversions) : '—'}</TD>
                    <TD numeric>
                      {row.performance ? formatCurrency(row.performance.conversionValueMicros, currency) : '—'}
                    </TD>
                    <TD numeric>
                      <a
                        href={row.href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Mở ${row.name} trong Klaviyo`}
                        className="inline-flex text-[var(--color-ink-3)] hover:text-[var(--color-accent)]"
                      >
                        <ExternalLink aria-hidden className="size-3.5" />
                      </a>
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

/** Dùng chung với `klaviyo-audience-panel.tsx` (Segment/List/Form) — export
 * để không lặp lại cùng một khối thẻ-danh-sách bốn lần. */
export function NameList({
  label,
  title,
  items,
  truncated,
}: {
  readonly label: string
  readonly title: string
  readonly items: readonly { readonly id: string; readonly name: string; readonly badge?: string; readonly href?: string }[]
  readonly truncated?: boolean
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead label={label} title={title} />
      {truncated ? (
        <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
          Danh sách lớn hơn số đọc được — bên dưới chỉ là một phần.
        </p>
      ) : null}
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <EmptyState title="Chưa có gì" description={`Tài khoản Klaviyo chưa có ${label.toLowerCase()} nào.`} />
        ) : (
          <ul className="divide-y divide-[var(--color-rule)]">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="truncate text-[length:var(--text-sm)] text-[var(--color-ink)]">{item.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {item.badge ? <Badge tone="outline">{item.badge}</Badge> : null}
                  {item.href ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Mở ${item.name} trong Klaviyo`}
                      className="inline-flex text-[var(--color-ink-3)] hover:text-[var(--color-accent)]"
                    >
                      <ExternalLink aria-hidden className="size-3.5" />
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}
