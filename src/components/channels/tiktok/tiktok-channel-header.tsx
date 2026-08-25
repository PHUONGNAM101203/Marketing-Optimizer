import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { ChannelAvatar } from '@/components/channels/channel-avatar'
import { ExternalChannelLink } from '@/components/connections/external-channel-link'
import { Badge } from '@/components/ui/badge'
import type { ChannelDetail } from '@/lib/data/site-channel-detail'
import { formatNumber } from '@/lib/format'

/* Hallmark · component: tiktok-channel-header · theme: studied-DNA (Ink & Signal)
 *
 * Thay hẳn khối PageHeader mặc định cho riêng trang TikTok — avatar lớn +
 * tên + 3 số liệu cùng hàng, giống bố cục trang cá nhân TikTok thật, khác
 * hẳn khối "avatar nhỏ trong description + stat-tile tách rời bên dưới" mà
 * mọi kênh khác vẫn dùng. KHÔNG có dòng @handle: adapter TikTok hiện chỉ
 * xin field `open_id,display_name,avatar_url` từ `user/info/`, không có
 * `username` — xem docs/superpowers/specs/2026-08-14-tiktok-channel-tabs-design.md.
 */
export function TiktokChannelHeader({
  siteId,
  detail,
  accountExtra,
  connected,
  dateRangeLabel,
  channelSwitcher,
}: {
  readonly siteId: string
  readonly detail: Extract<ChannelDetail, { readonly kind: 'tiktok' }>
  /** Trạng thái TÀI KHOẢN (follower/tổng lượt thích/số video) — cộng dồn từ
   * trước tới giờ, KHÔNG phải số của khoảng đang chọn.
   *
   * Nhận qua prop riêng thay vì tự rút từ `dailySeries` như bản trước:
   * `dailySeries` đã lọc theo khoảng ngày, mà snapshot TikTok chỉ có từ
   * 13/8/2026 — chọn tháng 7 là mảng rỗng và cả ba số về 0, tức khẳng định
   * tài khoản không có follower nào. `getChannelSummaries` đã lo phần lùi về
   * snapshot mới nhất khi khoảng không chứa hàng nào; ở đây chỉ hiển thị.
   * Bỏ hẳn `dailySeries` khỏi chữ ký để không ai vô tình nối lại ba con số
   * này vào khoảng ngày. */
  readonly accountExtra: Readonly<Record<string, number>>
  readonly connected: boolean
  readonly dateRangeLabel: string
  readonly channelSwitcher?: ReactNode
}) {

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
          provider="tiktok"
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
            <HeaderStat label="Follower" value={Number(accountExtra.followerCount ?? 0)} />
            <HeaderStat label="Lượt thích" value={Number(accountExtra.likesCount ?? 0)} />
            <HeaderStat label="Số video" value={Number(accountExtra.videoCount ?? 0)} />
          </div>

          <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">{dateRangeLabel}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {channelSwitcher}
          <ExternalChannelLink
            provider="tiktok"
            externalAccountId={detail.externalAccountId}
            variant="secondary"
            size="md"
          />
        </div>
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
