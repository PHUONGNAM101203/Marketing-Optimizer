import 'server-only'

import { fetchAllTiktokVideos } from '@/lib/providers/tiktok'
import { createAdminClient } from '@/lib/supabase/admin'

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

/**
 * Ghi snapshot HÔM NAY cho từng video TikTok của connection — gọi từ
 * `syncConnection`, không phải cron riêng (xem
 * docs/superpowers/specs/2026-08-14-video-snapshot-pipeline-design.md).
 * Không throw ra ngoài: lỗi ở đây không được làm hỏng phần đồng bộ
 * metrics_daily đã chạy xong trước đó trong cùng lượt `syncConnection`.
 */
export const syncTiktokVideoSnapshots = async (
  connectionId: string,
  accessToken: string,
): Promise<void> => {
  const admin = createAdminClient()
  const videos = await fetchAllTiktokVideos(accessToken)
  if (videos.length === 0) return

  const today = toIsoDate(new Date())
  const { error } = await admin.from('video_metrics_daily').upsert(
    videos.map((video) => ({
      connection_id: connectionId,
      external_video_id: video.externalVideoId,
      date: today,
      views: video.views,
      likes: video.likes,
      comments: video.comments,
      shares: video.shares,
      title: video.title,
      cover_image_url: video.coverImageUrl,
      synced_at: new Date().toISOString(),
    })),
    { onConflict: 'connection_id,external_video_id,date' },
  )

  if (error) console.error(`Không ghi được video_metrics_daily: ${error.message}`)
}
