import { Eye } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatCompact, formatDate } from '@/lib/format'
import { DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { TiktokVideoDetailDialog } from './tiktok-video-detail-dialog'
import type { TiktokVideoCardData } from './tiktok-video-grid'

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
          className={cn(
            'group relative aspect-[9/16] w-full overflow-hidden rounded-[var(--radius-md)]',
            'bg-[var(--color-paper-3)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
          )}
        >
          {video.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={video.coverImageUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Eye aria-hidden className="size-6 text-[var(--color-ink-3)]" />
            </div>
          )}

          <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[length:var(--text-2xs)] font-medium text-white">
            <Eye aria-hidden className="size-3" />
            {formatCompact(video.views)}
          </span>

          {video.createdAt ? (
            <span className="absolute top-1.5 right-1.5 rounded-[var(--radius-sm)] bg-black/60 px-1.5 py-0.5 text-[length:var(--text-2xs)] font-medium text-white">
              {formatDate(video.createdAt.slice(0, 10))}
            </span>
          ) : null}
        </button>
      </DialogTrigger>

      <TiktokVideoDetailDialog video={video} />
    </DialogRoot>
  )
}
