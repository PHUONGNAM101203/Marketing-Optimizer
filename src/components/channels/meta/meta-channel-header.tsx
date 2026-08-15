import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ChannelAvatar } from '@/components/channels/channel-avatar'
import { ExternalChannelLink } from '@/components/connections/external-channel-link'
import { Badge } from '@/components/ui/badge'
import type { ChannelDetail } from '@/lib/data/site-channel-detail'
import { formatNumber } from '@/lib/format'

/* Hallmark · component: meta-channel-header · theme: studied-DNA (Ink & Signal)
 *
 * Dùng chung cho Facebook và Instagram — cùng bố cục với
 * `TiktokChannelHeader` (avatar lớn + tên + số liệu cùng hàng) nhưng KHÔNG
 * tái dùng file đó (xem spec: tránh đụng code TikTok đã lên production).
 *
 * 2 số liệu, CẢ HAI ĐỀU LÀ TỔNG CỐ ĐỊNH — không phụ thuộc khoảng ngày trang
 * đang lọc, KHÁC bản đầu (cộng dồn `reach`/`impressions`/... từ Page/IG
 * Insights theo `dailySeries`, đổi theo bộ lọc ngày). Đổi vì hai lý do: (1)
 * header là chỗ để "một cái nhìn tổng quan cố định" của kênh, không phải
 * chỗ lặp lại đúng số liệu theo ngày đã có trong biểu đồ "Lượt hiển thị Page
 * theo ngày" ở thân trang; (2) Page/IG Insights cần `read_insights` (mới
 * khôi phục — xem lịch sử commit) VÀ dữ liệu cần thời gian tích luỹ mới có,
 * trong khi followerCount/totalEngagement dưới đây có ngay từ lần đồng bộ
 * đầu tiên, không phụ thuộc quyền vừa thêm.
 *   - `followerCount` — field `followers_count` trên node Page/IG, xem
 *     `fetchMetaFollowerCount` (`meta-discovery.ts`).
 *   - `totalEngagement` — tổng likes+comments+shares của MỌI bài đăng đã
 *     đồng bộ, tính sẵn trong `getContentTrending` (`content-trending.ts`),
 *     không tốn thêm request nào ở đây.
 */
export function MetaChannelHeader({
  siteId,
  detail,
  connected,
  dateRangeLabel,
}: {
  readonly siteId: string
  readonly detail: Extract<ChannelDetail, { readonly kind: 'facebook' | 'instagram' }>
  readonly connected: boolean
  readonly dateRangeLabel: string
}) {
  const stats = [
    { label: 'Người theo dõi', value: detail.followerCount },
    { label: 'Tổng lượt tương tác bài đăng', value: detail.trending.totalEngagement },
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

function HeaderStat({ label, value }: { readonly label: string; readonly value: number | null }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span data-numeric className="text-[length:var(--text-base)] font-semibold text-[var(--color-ink)]">
        {value === null ? '—' : formatNumber(value)}
      </span>
      <span className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">{label}</span>
    </div>
  )
}
