import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatCompact, formatDate } from '@/lib/format'
import { DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { VideoDetailDialog } from '@/components/channels/video/video-detail-dialog'
import type { TiktokVideoCardData } from './tiktok-video-grid'
import { ImageWithFallback } from '@/components/ui/image-with-fallback'

/* Hallmark · component: tiktok-video-card · theme: studied-DNA (Ink & Signal)
 *
 * Chữ trắng trên nền đen mờ ở đây KHÔNG dùng token màu — đây là lớp phủ đè
 * lên ảnh chụp thật (không kiểm soát được độ sáng/tối của ảnh), khác hẳn
 * chrome ứng dụng vốn phải đổi màu theo theme sáng/tối. Trắng-trên-đen cố
 * định là đúng ở đây, giống chính TikTok làm trên lưới video của họ.
 */
export function TiktokVideoCard({ video }: { readonly video: TiktokVideoCardData }) {
  return (
    <DialogRoot>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Xem chi tiết video: ${video.title}`}
          className={cn(
            'group relative aspect-[9/16] w-full overflow-hidden rounded-[var(--radius-md)]',
            'bg-[var(--color-paper-3)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
          )}
        >
          <ImageWithFallback
            src={video.thumbnailUrl}
            className="size-full object-cover"
            fallback={
              <div className="flex size-full items-center justify-center">
                <Eye aria-hidden className="size-6 text-[var(--color-ink-3)]" />
              </div>
            }
          />

          <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[length:var(--text-2xs)] font-medium text-white">
            <Eye aria-hidden className="size-3" />
            {formatCompact(video.views)}
          </span>

          {video.createdAt ? (
            <span className="absolute top-1.5 right-1.5 rounded-[var(--radius-sm)] bg-black/60 px-1.5 py-0.5 text-[length:var(--text-2xs)] font-medium text-white">
              {formatDate(video.createdAt.slice(0, 10))}
            </span>
          ) : null}

          {/* Góc TRÁI, tách khỏi huy hiệu ngày ở góc phải: thẻ chỉ rộng bằng
              1/6 lưới nên hai nhãn cạnh nhau sẽ chồng lên chữ của nhau. Nền đỏ
              đặc chứ không mờ như huy hiệu ngày — đây là trạng thái bất thường,
              phải đọc được cả khi đè lên ảnh sáng. */}
          {video.unavailableSince ? (
            <span
              title={`TikTok không còn liệt kê video này từ ${formatDate(video.unavailableSince)}`}
              className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-negative)] px-1.5 py-0.5 text-[length:var(--text-2xs)] font-medium text-[var(--color-ink-inverse)]"
            >
              <EyeOff aria-hidden className="size-3" />
              Không khả dụng
            </span>
          ) : null}
        </button>
      </DialogTrigger>

      <VideoDetailDialog
        video={{
          title: video.title,
          thumbnailUrl: video.thumbnailUrl,
          views: video.views,
          likes: video.likes,
          comments: video.comments,
          shares: video.shares,
          createdAt: video.createdAt,
          permalinkUrl: video.permalinkUrl,
          unavailableSince: video.unavailableSince,
        }}
        platformLabel="TikTok"
      />
    </DialogRoot>
  )
}
