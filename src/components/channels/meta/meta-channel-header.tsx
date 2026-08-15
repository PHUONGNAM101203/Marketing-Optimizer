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
  const latest = dailySeries.length > 0 ? dailySeries[dailySeries.length - 1] : null
  const latestExtra = latest?.extra ?? {}

  const stats =
    detail.kind === 'instagram'
      ? [
          { label: 'Reach', value: Number(latestExtra.reach ?? 0) },
          { label: 'Lượt hiển thị', value: Number(latestExtra.impressions ?? 0) },
          { label: 'Lượt xem trang cá nhân', value: Number(latestExtra.profileViews ?? 0) },
        ]
      : [
          { label: 'Lượt hiển thị', value: Number(latestExtra.impressions ?? 0) },
          { label: 'Người dùng tương tác', value: Number(latestExtra.engagedUsers ?? 0) },
          { label: 'Lượt tương tác bài đăng', value: Number(latestExtra.postEngagements ?? 0) },
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
