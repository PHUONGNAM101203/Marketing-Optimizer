import 'server-only'

import { fetchAllFacebookPosts, fetchAllInstagramMedia } from '@/lib/providers/meta-content'
import { createAdminClient } from '@/lib/supabase/admin'

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

/**
 * Ghi snapshot HÔM NAY cho từng bài đăng Facebook/Instagram của connection —
 * gọi từ `syncConnection`, cùng vai trò `syncTiktokVideoSnapshots`
 * (`sync-video-snapshots.ts`). Không throw ra ngoài: lỗi ở đây không được
 * làm hỏng phần đồng bộ `metrics_daily` đã chạy xong trước đó trong cùng
 * lượt `syncConnection`. Gọi qua `after()`, SAU khi đã cập nhật trạng thái
 * connection — xem chú thích trong `sync-connection.ts`.
 */
export const syncContentSnapshots = async (
  connectionId: string,
  provider: 'facebook' | 'instagram',
  accessToken: string,
  externalAccountId: string,
): Promise<void> => {
  const admin = createAdminClient()
  const posts =
    provider === 'facebook'
      ? await fetchAllFacebookPosts(accessToken, externalAccountId)
      : await fetchAllInstagramMedia(accessToken, externalAccountId)

  if (posts.length === 0) return

  // Khử trùng theo `externalPostId` TRƯỚC khi upsert — cùng lý do
  // `syncTiktokVideoSnapshots`: một khoá (connection_id, external_post_id,
  // date) xuất hiện hai lần trong MỘT lệnh upsert làm Postgres huỷ toàn bộ
  // lô (lỗi 21000). Phân trang lại có thể liệt kê trùng một bài nếu có bài
  // mới đăng giữa chừng làm lệch vị trí các trang sau.
  const uniquePosts = [...new Map(posts.map((post) => [post.externalPostId, post])).values()]

  const today = toIsoDate(new Date())
  const { error } = await admin.from('content_metrics_daily').upsert(
    uniquePosts.map((post) => ({
      connection_id: connectionId,
      provider,
      external_post_id: post.externalPostId,
      date: today,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      message: post.message,
      image_url: post.imageUrl,
      permalink: post.permalink,
      posted_at: post.postedAt,
      synced_at: new Date().toISOString(),
    })),
    { onConflict: 'connection_id,external_post_id,date' },
  )

  if (error) {
    console.error(`Không ghi được content_metrics_daily (${provider}): ${error.message}`)
  }
}
