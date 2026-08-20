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
 * `syncConnection` gọi hàm này qua `after()`, SAU khi đã cập nhật trạng thái
 * connection — bước này có thể kéo dài nhiều lượt gọi TikTok tuần tự và không
 * được cộng thêm độ trễ vào response của bất kỳ lối gọi nào.
 */
export const syncTiktokVideoSnapshots = async (
  connectionId: string,
  accessToken: string,
): Promise<void> => {
  const admin = createAdminClient()
  const { videos, error: fetchError } = await fetchAllTiktokVideos(accessToken)
  // Log lỗi THẬT (quyền bị từ chối, token hỏng...) — trước đây "0 video vì
  // lỗi API" và "0 video vì tài khoản chưa đăng gì" im lặng giống hệt nhau,
  // khiến trending/tổng quan tương tác kẹt mãi ở "Đang tích lũy dữ liệu" dù
  // đã đủ lịch sử kết nối, không có cách nào biết đây là lỗi thật từ log.
  if (fetchError) console.error(`Không lấy được danh sách video TikTok (connection ${connectionId}): ${fetchError}`)
  if (videos.length === 0) return

  // Khử trùng theo `externalVideoId` TRƯỚC khi upsert: nếu cùng bộ khóa
  // (connection_id, external_video_id, date) xuất hiện hai lần trong MỘT lệnh
  // upsert, Postgres báo lỗi 21000 và huỷ TOÀN BỘ lô — không ghi được dòng
  // nào cho connection đó trong ngày. TikTok có thể liệt kê lại một video khi
  // phân trang (vd. có bài mới đăng giữa chừng làm lệch vị trí). Lấy bản cuối
  // là đủ: tất cả đều là snapshot của hôm nay, giá trị gần như giống nhau.
  const uniqueVideos = [...new Map(videos.map((video) => [video.externalVideoId, video])).values()]

  const today = toIsoDate(new Date())
  const { error } = await admin.from('video_metrics_daily').upsert(
    uniqueVideos.map((video) => ({
      connection_id: connectionId,
      external_video_id: video.externalVideoId,
      date: today,
      views: video.views,
      likes: video.likes,
      comments: video.comments,
      shares: video.shares,
      title: video.title,
      cover_image_url: video.coverImageUrl,
      posted_at: video.createdAt,
      permalink_url: video.permalinkUrl,
      synced_at: new Date().toISOString(),
    })),
    { onConflict: 'connection_id,external_video_id,date' },
  )

  if (error) console.error(`Không ghi được video_metrics_daily: ${error.message}`)
}
