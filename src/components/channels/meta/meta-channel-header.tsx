import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ChannelAvatar } from '@/components/channels/channel-avatar'
import { ExternalChannelLink } from '@/components/connections/external-channel-link'
import { Badge } from '@/components/ui/badge'
import type { ChannelDetail } from '@/lib/data/site-channel-detail'
import type { ChannelDailyPoint } from '@/lib/data/site-channels'
import { formatNumber } from '@/lib/format'

/* Hallmark · component: meta-channel-header · theme: studied-DNA (Ink & Signal)
 *
 * Dùng chung cho Facebook và Instagram — cùng bố cục với
 * `TiktokChannelHeader` (avatar lớn + tên + 3 số liệu cùng hàng) nhưng KHÔNG
 * tái dùng file đó (xem spec: tránh đụng code TikTok đã lên production).
 * 3 số liệu header lấy từ field ĐÃ được fetch bởi
 * instagramMetricsAdapter/facebookMetricsAdapter nhưng trước giờ chưa hiện
 * ở đâu cả (`reach`/`impressions`/`profileViews` cho Instagram,
 * `impressions`/`engagedUsers`/`postEngagements` cho Facebook) — không cần
 * đổi gì ở adapter.
 */
export function MetaChannelHeader({
  siteId,
  detail,
  dailySeries,
  connected,
  dateRangeLabel,
}: {
  readonly siteId: string
  readonly detail: Extract<ChannelDetail, { readonly kind: 'facebook' | 'instagram' }>
  readonly dailySeries: readonly ChannelDailyPoint[]
  readonly connected: boolean
  readonly dateRangeLabel: string
}) {
  // Facebook/Instagram KHÔNG nằm trong SNAPSHOT_PROVIDERS (khác TikTok) —
  // mỗi điểm trong dailySeries là số liệu THẬT của đúng ngày đó (Page/IG
  // Insights có period=day thật), nên header phải CỘNG DỒN cả khoảng ngày
  // để khớp với nhãn `dateRangeLabel` bên dưới, không phải chỉ lấy ngày
  // cuối cùng — chỉ lấy ngày cuối từng khiến header hiện "0" khi ngày gần
  // nhất chưa được Meta xử lý xong (có độ trễ báo cáo).
  const totals = dailySeries.reduce(
    (accumulated, point) => ({
      reach: accumulated.reach + Number(point.extra.reach ?? 0),
      impressions: accumulated.impressions + Number(point.extra.impressions ?? 0),
      profileViews: accumulated.profileViews + Number(point.extra.profileViews ?? 0),
      engagedUsers: accumulated.engagedUsers + Number(point.extra.engagedUsers ?? 0),
      postEngagements: accumulated.postEngagements + Number(point.extra.postEngagements ?? 0),
    }),
    { reach: 0, impressions: 0, profileViews: 0, engagedUsers: 0, postEngagements: 0 },
  )

  const stats =
    detail.kind === 'instagram'
      ? [
          { label: 'Reach', value: totals.reach },
          { label: 'Lượt hiển thị', value: totals.impressions },
          { label: 'Lượt xem trang cá nhân', value: totals.profileViews },
        ]
      : [
          { label: 'Lượt hiển thị', value: totals.impressions },
          { label: 'Người dùng tương tác', value: totals.engagedUsers },
          { label: 'Lượt tương tác bài đăng', value: totals.postEngagements },
        ]

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/${siteId}/channels`}
        className="inline-flex w-fit items-center gap-1 rounded-[var(--radius-sm)] text-[length:var(--text-sm)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Tất cả kênh
      </Link>

      <div className="flex flex-wrap items-start gap-5">
        <ChannelAvatar
          avatarUrl={detail.avatarUrl}
          provider={detail.kind}
          size="lg"
          className="size-20 sm:size-24"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 truncate text-[length:var(--text-display)] leading-[var(--leading-tight)] font-bold tracking-[var(--tracking-tight)] text-[var(--color-ink)]">
              {detail.accountName}
            </h1>
            {connected ? <Badge tone="positive">Đã kết nối</Badge> : null}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {stats.map((stat) => (
              <HeaderStat key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>

          <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">{dateRangeLabel}</p>
        </div>

        <ExternalChannelLink
          provider={detail.kind}
          externalAccountId={detail.externalAccountId}
          variant="secondary"
          size="md"
        />
      </div>
    </div>
  )
}

function HeaderStat({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span data-numeric className="text-[length:var(--text-base)] font-semibold text-[var(--color-ink)]">
        {formatNumber(value)}
      </span>
      <span className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">{label}</span>
    </div>
  )
}
