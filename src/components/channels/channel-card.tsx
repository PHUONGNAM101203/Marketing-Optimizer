import Link from 'next/link'
import { ArrowRight, Settings2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ProviderMark } from '@/components/connections/provider-mark'
import { InlineLocked } from '@/components/connections/inline-locked'
import type { ChannelSummary } from '@/lib/data/site-channels'
import { PROVIDER_META, hasCapability, type ProviderId } from '@/lib/domain/providers'
import { formatCompact, formatCurrencyCompact, formatNumber, formatPercent } from '@/lib/format'

/**
 * Tách khỏi `channels/page.tsx` để dùng lại ở CẢ HAI nơi: lưới 10 thẻ ở trang
 * Kênh, và lưới chi tiết từng kênh trong tab "Tổng hợp" của trang Tổng quan —
 * cùng một sự thật (đúng chỉ số riêng của từng nền tảng), không viết hai lần.
 */
export function ChannelCard({
  siteId,
  provider,
  summary,
  currency,
}: {
  readonly siteId: string
  readonly provider: ProviderId
  readonly summary: ChannelSummary
  readonly currency: string
}) {
  const body = (
    <Link
      href={`/${siteId}/channels/${provider}`}
      className="group flex h-full flex-col gap-4 rounded-[var(--radius-lg)] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProviderMark provider={provider} />
          <p className="truncate text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
            {PROVIDER_META[provider].label}
          </p>
        </div>
        <ArrowRight
          aria-hidden
          className="size-4 shrink-0 text-[var(--color-ink-3)] transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5"
        />
      </div>

      <ChannelHeadline provider={provider} summary={summary} currency={currency} />
    </Link>
  )

  if (!summary.connected) {
    return (
      <Card tone="bordered" className="flex h-full flex-col">
        <InlineLocked siteId={siteId} label="Chưa kết nối" className="h-full">
          {body}
        </InlineLocked>
      </Card>
    )
  }

  return (
    <Card tone="bordered" className="flex h-full flex-col">
      {body}
    </Card>
  )
}

/**
 * GTM không có metrics — nó có CẤU HÌNH (tag/trigger/variable). Ép nó hiện
 * "0 lượt hiển thị" sẽ trông như lỗi thay vì đúng bản chất "không áp dụng".
 */
function ChannelHeadline({
  provider,
  summary,
  currency,
}: {
  readonly provider: ProviderId
  readonly summary: ChannelSummary
  readonly currency: string
}) {
  if (provider === 'gtm') {
    return (
      <div className="flex flex-1 flex-col justify-center gap-1.5 py-2">
        <Settings2 aria-hidden className="size-5 text-[var(--color-ink-3)]" />
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          Quản lý thẻ — xem cấu hình container
        </p>
      </div>
    )
  }

  if (provider === 'merchant-center') {
    if (!summary.hasData) {
      return (
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
          Đang đồng bộ lần đầu…
        </p>
      )
    }
    const { extra } = summary
    return (
      <HeadlineBlock
        label="Sản phẩm đã duyệt"
        value={formatCompact(extra.approvedProducts ?? 0)}
        secondary={[
          { label: 'Bị từ chối', value: formatCompact(extra.disapprovedProducts ?? 0) },
          { label: 'Đang chờ duyệt', value: formatCompact(extra.pendingProducts ?? 0) },
        ]}
      />
    )
  }

  // Instagram/Facebook có MỘT nguồn số liệu THỨ HAI ngoài `metrics_daily`:
  // follower count gọi trực tiếp Graph API (xem
  // `data/site-channels.ts::getChannelSummaries`), không phụ thuộc
  // `summary.hasData` (vốn chỉ phản ánh đúng pipeline Page Insights theo
  // ngày — hai pipeline độc lập, một cái lỗi không được che luôn cái kia,
  // đúng bài học từ lần Page Insights lỗi âm thầm khiến follower/tương tác
  // ĐÃ CÓ THẬT nhưng thẻ vẫn hiện "Đang đồng bộ lần đầu…" vĩnh viễn). Vì vậy
  // hai nhánh này nằm TRƯỚC gate `!summary.hasData` chung bên dưới, tự quyết
  // định hiện gì dựa trên từng nguồn có hay không.
  if (provider === 'instagram' || provider === 'facebook') {
    const { extra } = summary
    if (!summary.hasData && !extra.followerCount) {
      return (
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
          Đang đồng bộ lần đầu…
        </p>
      )
    }

    // Instagram không có sessions/conversions (bảy cột chung của web
    // analytics và ads) — reach/impressions/profile views nằm ở `extra`.
    // Facebook: `page_impressions` rồi `page_engaged_users` đều bị Meta
    // khai tử, chỉ còn `page_post_engagements` request được ở cấp Page (xem
    // `facebook-metrics.ts`).
    const secondary =
      !summary.hasData
        ? []
        : provider === 'instagram'
          ? [
              { label: 'Reach', value: formatCompact(extra.reach ?? 0) },
              { label: 'Hiển thị', value: formatCompact(extra.impressions ?? 0) },
            ]
          : [{ label: 'Tương tác bài viết', value: formatCompact(extra.postEngagements ?? 0) }]

    return (
      <HeadlineBlock label="Follower" value={formatCompact(extra.followerCount ?? 0)} secondary={secondary} />
    )
  }

  if (!summary.hasData) {
    return (
      <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
        Đang đồng bộ lần đầu…
      </p>
    )
  }

  const { totals, extra } = summary

  if (provider === 'youtube') {
    return (
      <HeadlineBlock
        label="Lượt xem"
        value={formatCompact(extra.views ?? 0)}
        secondary={[
          { label: 'Phút xem', value: formatCompact(extra.watchTimeMinutes ?? 0) },
          { label: 'Subscriber mới', value: formatNumber(extra.subscribersGained ?? 0) },
        ]}
      />
    )
  }

  // TikTok là SNAPSHOT (xem `data/site-channels.ts::SNAPSHOT_PROVIDERS`) —
  // follower/like/video count là trạng thái NGAY LÚC đồng bộ, không phải
  // "phát sinh trong kỳ" như các provider khác — không lẫn vào `totals`.
  if (provider === 'tiktok') {
    return (
      <HeadlineBlock
        label="Follower"
        value={formatCompact(extra.followerCount ?? 0)}
        secondary={[
          { label: 'Lượt thích', value: formatCompact(extra.likesCount ?? 0) },
          { label: 'Số video', value: formatCompact(extra.videoCount ?? 0) },
        ]}
      />
    )
  }

  if (hasCapability(provider, 'spend')) {
    return (
      <HeadlineBlock
        label="Chi phí"
        value={formatCurrencyCompact(totals.costMicros, currency)}
        secondary={[
          { label: 'Chuyển đổi', value: formatNumber(totals.conversions) },
          {
            label: 'CTR',
            value: formatPercent(
              totals.impressions > 0 ? totals.clicks / totals.impressions : null,
              2,
            ),
          },
        ]}
      />
    )
  }

  if (hasCapability(provider, 'rankings')) {
    return (
      <HeadlineBlock
        label="Lượt nhấp tự nhiên"
        value={formatCompact(totals.clicks)}
        secondary={[
          { label: 'Hiển thị', value: formatCompact(totals.impressions) },
          {
            label: 'CTR',
            value: formatPercent(
              totals.impressions > 0 ? totals.clicks / totals.impressions : null,
              2,
            ),
          },
        ]}
      />
    )
  }

  return (
    <HeadlineBlock
      label="Phiên"
      value={formatCompact(totals.sessions)}
      secondary={[
        { label: 'Người dùng', value: formatCompact(totals.users) },
        { label: 'Chuyển đổi', value: formatNumber(totals.conversions) },
      ]}
    />
  )
}

function HeadlineBlock({
  label,
  value,
  secondary,
}: {
  readonly label: string
  readonly value: string
  readonly secondary: readonly { readonly label: string; readonly value: string }[]
}) {
  return (
    <>
      <div>
        <p className="text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
          {label}
        </p>
        <p
          data-numeric
          className="mt-1 truncate text-[length:var(--text-3xl)] leading-[var(--leading-tight)] font-semibold tracking-[var(--tracking-tight)] text-[var(--color-ink)]"
        >
          {value}
        </p>
      </div>

      {secondary.length > 0 && (
        <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--color-rule)] pt-3">
          {secondary.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="truncate text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
                {item.label}
              </dt>
              <dd
                data-numeric
                className="truncate text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]"
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}
