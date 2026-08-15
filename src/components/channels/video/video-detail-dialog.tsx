import { ExternalLink, Eye, Heart, MessageCircle, Share2 } from 'lucide-react'
import { DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatCompact, formatDateTime } from '@/lib/format'
import type { VideoRankingItem } from './video-ranking-list'

/* Hallmark · component: video-detail-dialog · theme: studied-DNA (Ink & Signal)
 *
 * Dùng chung cho TikTok VÀ YouTube (xem `video-ranking-list.tsx` cho lý do
 * gộp) — KHÔNG dùng chung với Facebook/Instagram (`meta-post-detail-dialog.tsx`),
 * hình dạng dữ liệu khác nhau (có "views", không có "views"). `platformLabel`
 * đổi chữ nút link ("Xem trên TikTok"/"Xem trên YouTube"); nút TỰ ẨN khi
 * `permalinkUrl` null — xảy ra với bảng "mọi thời gian" của TikTok (nguồn
 * snapshot `video_metrics_daily` hiện chưa lưu link gốc, chỉ bảng "trong
 * khoảng ngày" — nguồn live Display API — có link; YouTube luôn có link vì
 * dựng thẳng từ `externalVideoId`, không phụ thuộc nguồn).
 */
export function VideoDetailDialog({
  video,
  platformLabel,
}: {
  readonly video: VideoRankingItem
  readonly platformLabel: string
}) {
  return (
    <DialogContent
      title={video.title}
      description={
        video.createdAt
          ? formatDateTime(video.createdAt, {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailUrl}
            alt=""
            loading="lazy"
            className="max-h-80 w-full rounded-[var(--radius-md)] object-cover"
          />
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <DetailStat icon={Eye} label="Lượt xem" value={formatCompact(video.views)} />
          <DetailStat icon={Heart} label="Lượt thích" value={formatCompact(video.likes)} />
          <DetailStat icon={MessageCircle} label="Bình luận" value={formatCompact(video.comments)} />
          {video.shares !== null ? (
            <DetailStat icon={Share2} label="Chia sẻ" value={formatCompact(video.shares)} />
          ) : null}
        </div>

        {video.permalinkUrl ? (
          <Button asChild variant="secondary" size="md">
            <a href={video.permalinkUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden className="size-4" />
              Xem trên {platformLabel}
            </a>
          </Button>
        ) : null}
      </div>
    </DialogContent>
  )
}

function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  readonly icon: typeof Eye
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-rule)] px-3 py-2.5">
      <Icon aria-hidden className="size-4 shrink-0 text-[var(--color-ink-3)]" />
      <div className="min-w-0">
        <p data-numeric className="text-[length:var(--text-lg)] font-semibold text-[var(--color-ink)]">
          {value}
        </p>
        <p className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">{label}</p>
      </div>
    </div>
  )
}
