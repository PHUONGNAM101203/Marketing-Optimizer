import 'server-only'

import { fetchAllTiktokVideos, fetchTiktokOriginalThumbnail } from '@/lib/providers/tiktok'
import { createAdminClient } from '@/lib/supabase/admin'
import { mediaPathForVideo, mirrorImage, publicMediaUrl } from '@/lib/storage/media-mirror'

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

  // Chép ảnh bìa về Storage TRƯỚC khi ghi, rồi ghi URL của chính mình vào
  // `cover_image_url`. Link TikTok có chữ ký và hết hạn — đo thật 27/8/2026:
  // 0/6 ảnh ở snapshot cũ nhất còn sống. Ghi thẳng URL nội bộ nghĩa là không
  // cột mới, không đổi RPC, không đổi UI: mọi nơi đang đọc field này tự nhiên
  // nhận được ảnh vĩnh viễn.
  //
  // TUẦN TỰ, không `Promise.all`: `mirrorImage` bỏ qua ngay ảnh đã chép (kiểm
  // tra chuỗi, không gọi mạng) nên lượt thường chỉ tốn vài mili-giây; còn lượt
  // đầu tiên mà bắn cả trăm request song song vào CDN TikTok là cách nhanh
  // nhất để bị chặn.
/**
 * URL ảnh đã chép của những mục này, để KHÔNG tải lại thứ đã có.
 *
 * Cần thiết vì `mirrorImage` chỉ nhận biết được "đã chép rồi" qua URL truyền
 * vào, mà URL nền tảng trả về LUÔN là link ngoài mới ở mỗi lượt đồng bộ. Không
 * tra lại bảng thì mỗi giờ lại tải và upload lại toàn bộ ảnh của mọi kênh.
 *
 * Sắp theo ngày giảm dần rồi lấy hàng đầu tiên gặp của mỗi mục: đó là bản mới
 * nhất. Trần 1000 hàng là dư — mỗi mục chỉ có một hàng mỗi ngày, nên riêng
 * ngày mới nhất đã phủ hết mọi mục.
 */
  const { data: storedRows } = await admin
    .from('video_metrics_daily')
    .select('external_video_id, cover_image_url')
    .eq('connection_id', connectionId)
    .order('date', { ascending: false })
    .limit(1000)

  const alreadyStored = new Map<string, string>()
  for (const row of storedRows ?? []) {
    if (alreadyStored.has(row.external_video_id) || !row.cover_image_url) continue
    const expected = publicMediaUrl(mediaPathForVideo(row.external_video_id))
    if (row.cover_image_url.startsWith(expected)) {
      alreadyStored.set(row.external_video_id, row.cover_image_url)
    }
  }

  const mirroredCovers = new Map<string, string | null>()
  for (const video of uniqueVideos) {
    const stored = alreadyStored.get(video.externalVideoId)
    if (stored) {
      mirroredCovers.set(video.externalVideoId, stored)
      continue
    }

    // Ưu tiên ảnh GỐC qua oEmbed (đo được 1440x2560) thay vì `cover_image_url`
    // của Display API (luôn 300x400 và không xin lớn hơn được — xem
    // `fetchTiktokOriginalThumbnail`). Rơi về `cover_image_url` khi oEmbed
    // không trả ảnh: video không còn công khai thì vẫn nên giữ được tấm ảnh
    // 300x400 cuối cùng còn lấy được, hơn là không có gì.
    const source =
      (await fetchTiktokOriginalThumbnail(video.permalinkUrl)) ?? video.coverImageUrl
    mirroredCovers.set(
      video.externalVideoId,
      await mirrorImage(admin, source, mediaPathForVideo(video.externalVideoId)),
    )
  }

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
      cover_image_url: mirroredCovers.get(video.externalVideoId) ?? video.coverImageUrl,
      posted_at: video.createdAt,
      permalink_url: video.permalinkUrl,
      synced_at: new Date().toISOString(),
    })),
    { onConflict: 'connection_id,external_video_id,date' },
  )

  if (error) console.error(`Không ghi được video_metrics_daily: ${error.message}`)
}
