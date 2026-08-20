import { AlertTriangle } from 'lucide-react'
import { SectionHead } from '@/components/ui/card'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { TiktokVideoCard } from './tiktok-video-card'
import type { VideoSummary } from '@/lib/providers/video-trending-types'

export type TiktokVideoCardData = VideoSummary

/* Hallmark · component: tiktok-video-grid · theme: studied-DNA (Ink & Signal)
 *
 * Lưới dày (3-6 cột) thay cho lưới thẻ lớn dùng chung với YouTube — TikTok
 * có ảnh reference riêng (grid video dạng dọc 9:16 sát nhau, không caption
 * trên thẻ) nên tách hẳn khỏi `VideoCardGrid` thay vì tham số hoá thêm một
 * biến thể vào component đó.
 *
 * TOÀN BỘ video trong khoảng ngày (không phải "top" nào) — nguồn
 * (`getTiktokVideosPostedInRange`) đã sắp sẵn theo `posted_at` GIẢM DẦN (mới
 * nhất trước, chính xác tới giây), giữ nguyên thứ tự nhận được, không tự sắp
 * lại theo views ở đây.
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
      <SectionHead label="Video" title="Toàn bộ video theo ngày đăng" />
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
          description="Không có video nào được đăng trong khoảng ngày này."
        />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {videos.map((video) => (
            <TiktokVideoCard key={video.externalVideoId} video={video} />
          ))}
        </div>
      )}
    </section>
  )
}
