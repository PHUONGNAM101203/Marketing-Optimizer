import { AlertTriangle } from 'lucide-react'
import { SectionHead } from '@/components/ui/card'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { TiktokVideoCard } from './tiktok-video-card'
import type { TiktokExplore } from '@/lib/providers/tiktok'

export type TiktokVideoCardData = TiktokExplore['topVideos'][number]

/* Hallmark · component: tiktok-video-grid · theme: studied-DNA (Ink & Signal)
 *
 * Lưới dày (3-6 cột) thay cho lưới thẻ lớn dùng chung với YouTube — TikTok
 * có ảnh reference riêng (grid video dạng dọc 9:16 sát nhau, không caption
 * trên thẻ) nên tách hẳn khỏi `VideoCardGrid` thay vì tham số hoá thêm một
 * biến thể vào component đó.
 */
export function TiktokVideoGrid({
  videos,
  fetchError,
}: {
  readonly videos: readonly TiktokVideoCardData[]
  readonly fetchError: string | null
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead label="Video" title="Video xem nhiều nhất" />
      {fetchError ? (
        <Callout
          tone="critical"
          icon={<AlertTriangle aria-hidden className="size-5 text-[var(--color-negative)]" />}
          title="Không lấy được danh sách video"
        >
          <p>{fetchError}</p>
        </Callout>
      ) : videos.length === 0 ? (
        <EmptyState
          title="Chưa có video"
          description="Chưa có video công khai trong khoảng ngày này — TikTok chỉ trả về 20 video đăng gần nhất, chọn khoảng ngày mới hơn nếu cần."
        />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {videos.map((video, index) => (
            <TiktokVideoCard key={index} video={video} />
          ))}
        </div>
      )}
    </section>
  )
}
