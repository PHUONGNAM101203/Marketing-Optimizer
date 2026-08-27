import { Eye, Heart, ImageOff, MessageCircle, Share2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { VideoDetailDialog } from './video-detail-dialog'
import { formatCompact, formatDate } from '@/lib/format'
import { ImageWithFallback } from '@/components/ui/image-with-fallback'

export interface VideoRankingItem {
  readonly title: string
  readonly thumbnailUrl: string | null
  readonly views: number
  readonly likes: number
  readonly comments: number
  /** `null` = không đọc được (khác 0 chia sẻ thật) — xem `VideoSummary.shares`
   * (`video-trending-types.ts`), YouTube Analytics chưa chắc luôn trả cột này. */
  readonly shares: number | null
  readonly createdAt: string | null
  /** `null` khi nguồn dữ liệu không lưu link gốc — xem docblock
   * `video-detail-dialog.tsx`. Nút "Xem trên X" tự ẩn khi null. */
  readonly permalinkUrl: string | null
  /** Ngày nền tảng thôi liệt kê video, `null` khi bình thường hoặc khi nguồn
   * không biết — xem `VideoSummary.unavailableSince`. */
  readonly unavailableSince?: string | null
}

/* Hallmark · component: video-ranking-list · theme: studied-DNA (Ink & Signal)
 *
 * Danh sách hàng ngang có số thứ hạng — dùng chung cho TikTok VÀ YouTube, cả
 * hai chia sẻ đúng một hình dạng dữ liệu có "views" (`VideoSummary`), khác
 * Facebook/Instagram (không có views, xếp theo tổng engagement — xem
 * `MetaRankingList`, KHÔNG gộp chung được vì khác hẳn field xếp hạng chính).
 * Click mở dialog chi tiết + link tới video gốc (khi có) — trước đây
 * (`TiktokVideoRankingList` cũ) chỉ hiện view count tĩnh, không tương tác
 * được, cũng không thấy comment/share/like.
 *
 * likes/comments/shares ẩn dưới `sm` — 4 con số cùng "views" trên một hàng
 * hẹp vỡ layout ở màn điện thoại; "views" luôn là chỉ số xếp hạng chính nên
 * giữ lại, phần còn lại xem đủ trong dialog chi tiết khi bấm vào.
 */
export function VideoRankingList({
  items,
  platformLabel,
  fetchError,
  emptyTitle,
  emptyDescription,
}: {
  readonly items: readonly VideoRankingItem[]
  readonly platformLabel: string
  readonly fetchError?: string | null
  readonly emptyTitle: string
  readonly emptyDescription: string
}) {
  if (fetchError) {
    return <EmptyState title="Không lấy được danh sách video" description={fetchError} />
  }

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <Card className="flex flex-col divide-y divide-[var(--color-rule)] overflow-hidden p-0">
      {items.map((item, index) => (
        <DialogRoot key={index}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-[var(--color-paper-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              <span
                data-numeric
                className="w-5 shrink-0 text-[length:var(--text-sm)] font-semibold text-[var(--color-ink-3)]"
              >
                {index + 1}
              </span>
              <ImageWithFallback
                src={item.thumbnailUrl}
                className="size-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
                fallback={
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-paper-3)]">
                    <ImageOff aria-hidden className="size-4 text-[var(--color-ink-3)]" />
                  </div>
                }
              />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[length:var(--text-sm)] text-[var(--color-ink)]"
                  title={item.title}
                >
                  {item.title}
                </p>
                {item.createdAt ? (
                  <p className="mt-0.5 text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
                    {formatDate(item.createdAt.slice(0, 10))}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  data-numeric
                  className="flex items-center gap-1 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]"
                >
                  <Eye aria-hidden className="size-3.5 text-[var(--color-ink-3)]" />
                  {formatCompact(item.views)}
                </span>
                <span
                  data-numeric
                  className="hidden items-center gap-1 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)] sm:flex"
                >
                  <Heart aria-hidden className="size-3.5 text-[var(--color-ink-3)]" />
                  {formatCompact(item.likes)}
                </span>
                <span
                  data-numeric
                  className="hidden items-center gap-1 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)] sm:flex"
                >
                  <MessageCircle aria-hidden className="size-3.5 text-[var(--color-ink-3)]" />
                  {formatCompact(item.comments)}
                </span>
                {item.shares !== null ? (
                  <span
                    data-numeric
                    className="hidden items-center gap-1 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)] sm:flex"
                  >
                    <Share2 aria-hidden className="size-3.5 text-[var(--color-ink-3)]" />
                    {formatCompact(item.shares)}
                  </span>
                ) : null}
              </div>
            </button>
          </DialogTrigger>

          <VideoDetailDialog video={item} platformLabel={platformLabel} />
        </DialogRoot>
      ))}
    </Card>
  )
}
