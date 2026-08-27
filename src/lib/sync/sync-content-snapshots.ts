import 'server-only'

import {
  fetchAllFacebookPosts,
  fetchAllInstagramMedia,
  fetchFacebookOriginalPhoto,
} from '@/lib/providers/meta-content'
import { createAdminClient } from '@/lib/supabase/admin'
import { mediaPathForPost, mirrorImage, publicMediaUrl } from '@/lib/storage/media-mirror'

/** Dưới mức này thì đáng hỏi thêm node ảnh để lấy bản gốc. 1080 là bề rộng
 * ảnh chuẩn của cả Facebook lẫn Instagram; ảnh Graph trả sẵn có trung vị 700px
 * nên phần lớn bài sẽ đi qua nhánh này ĐÚNG MỘT LẦN, rồi lượt sau bỏ qua vì
 * ảnh đã nằm trong Storage. */
const MIN_ACCEPTABLE_IMAGE_WIDTH = 1080

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

  // Chép ảnh về Storage trước khi ghi — cùng lý do và cùng cách làm với
  // `syncTiktokVideoSnapshots`, xem chú thích ở đó.
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
    .from('content_metrics_daily')
    .select('external_post_id, image_url')
    .eq('connection_id', connectionId)
    .order('date', { ascending: false })
    .limit(1000)

  const alreadyStored = new Map<string, string>()
  for (const row of storedRows ?? []) {
    if (alreadyStored.has(row.external_post_id) || !row.image_url) continue
    const expected = publicMediaUrl(mediaPathForPost(row.external_post_id))
    if (row.image_url.startsWith(expected)) {
      alreadyStored.set(row.external_post_id, row.image_url)
    }
  }

  const mirroredImages = new Map<string, string | null>()
  for (const post of uniquePosts) {
    const stored = alreadyStored.get(post.externalPostId)
    if (stored) {
      mirroredImages.set(post.externalPostId, stored)
      continue
    }

    // Hỏi ảnh gốc CHỈ ở đây, sau khi đã biết bài này thật sự cần chép — hỏi
    // sớm hơn (lúc liệt kê bài) là tốn một lượt gọi Graph cho mỗi bài ở MỌI
    // lượt đồng bộ, kể cả những bài đã có ảnh từ lâu.
    const tooSmall = post.imageWidth === null || post.imageWidth < MIN_ACCEPTABLE_IMAGE_WIDTH
    const source =
      post.photoNodeId && tooSmall
        ? ((await fetchFacebookOriginalPhoto(accessToken, post.photoNodeId)) ?? post.imageUrl)
        : post.imageUrl

    mirroredImages.set(
      post.externalPostId,
      await mirrorImage(admin, source, mediaPathForPost(post.externalPostId)),
    )
  }

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
      image_url: mirroredImages.get(post.externalPostId) ?? post.imageUrl,
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
