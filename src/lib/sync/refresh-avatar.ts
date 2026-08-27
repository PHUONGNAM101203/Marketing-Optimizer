import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { ProviderId } from '@/lib/domain/providers'
import { mediaPathForAvatar, mirrorImage } from '@/lib/storage/media-mirror'
import { tiktokAdapter } from '@/lib/providers/tiktok'
import { discoverYoutubeAccounts } from '@/lib/providers/google-discovery'
import { fetchMetaAvatarUrl } from '@/lib/providers/meta-discovery'

/**
 * Chép ảnh đại diện kênh về Storage, xin link mới từ nền tảng nếu link đang lưu
 * đã chết.
 *
 * Vì sao cần: `connections.avatar_url` chỉ được ghi ĐÚNG MỘT LẦN trong OAuth
 * callback rồi không bao giờ làm mới, mà URL của TikTok và fbcdn đều có chữ ký
 * và hết hạn. Đo thật 27/8/2026 trên production: cả ba ảnh đại diện đang lưu
 * (2 TikTok + 1 Facebook) đều trả HTTP 403. `ChannelAvatar` chỉ có ảnh dự phòng
 * khi giá trị là NULL, nên link chết vẫn render một thẻ `<img>` hỏng.
 *
 * Khác phần chép thumbnail ở một điểm quan trọng: ảnh đại diện LẤY LẠI ĐƯỢC.
 * Video cũ mà TikTok không còn trả về thì ảnh mất hẳn, còn tài khoản thì vẫn ở
 * đó và API luôn cấp được link mới.
 *
 * Đánh đổi đã cân nhắc: chép xong thì thôi, không làm mới nữa. Người dùng đổi
 * ảnh đại diện trên nền tảng sẽ không thấy đổi trong app cho tới lần kết nối
 * lại. Chấp nhận, vì ảnh đại diện rất ít khi đổi, còn phương án làm mới mỗi giờ
 * thì tốn thêm một lượt gọi API cho mỗi kênh mỗi giờ VĨNH VIỄN chỉ để phòng một
 * việc hiếm — và ảnh cũ vẫn tốt hơn nhiều so với ảnh vỡ.
 */

/** Chỉ bốn nền tảng này có khái niệm ảnh đại diện kênh. Còn lại (GA4, Search
 * Console, GTM, Google Ads, Merchant Center, Meta Ads) hiển thị `ProviderMark`
 * và không lưu avatar bao giờ. */
const hasAvatar = (provider: ProviderId): boolean =>
  provider === 'tiktok' ||
  provider === 'youtube' ||
  provider === 'facebook' ||
  provider === 'instagram'

const isMirrored = (url: string): boolean => url.includes('/storage/v1/object/public/media/')

/** Xin link ảnh đại diện CÒN SỐNG từ nền tảng. */
const fetchFreshAvatarUrl = async (
  provider: ProviderId,
  accessToken: string,
  externalAccountId: string,
): Promise<string | null> => {
  switch (provider) {
    case 'tiktok': {
      // Display API gắn token với đúng một tài khoản, nên `listAccounts` luôn
      // trả về một phần tử và tham số domain không có tác dụng gì.
      const accounts = await tiktokAdapter.listAccounts(accessToken, '')
      return accounts[0]?.avatarUrl ?? null
    }
    case 'youtube': {
      const accounts = await discoverYoutubeAccounts(accessToken)
      return accounts.find((a) => a.externalAccountId === externalAccountId)?.avatarUrl ?? null
    }
    case 'facebook':
    case 'instagram':
      // `accessToken` ở đây LÀ Page token (xem `resolvePageAccessToken` trong
      // `sync-connection.ts`), nên phải gọi thẳng node chứ không dùng
      // `discoverMetaAccounts` — hàm đó liệt kê `/me/accounts` và cần User token.
      return fetchMetaAvatarUrl(accessToken, externalAccountId, provider)
    default:
      return null
  }
}

export const refreshConnectionAvatar = async (
  admin: SupabaseClient<Database>,
  connection: {
    readonly id: string
    readonly provider: ProviderId
    readonly external_account_id: string
    readonly avatar_url: string | null
  },
  accessToken: string,
): Promise<void> => {
  if (!hasAvatar(connection.provider)) return
  // Đã là ảnh của chính mình thì xong hẳn — đây là đường thoát ở MỌI lượt đồng
  // bộ sau lần đầu, và nó không tốn gì ngoài một phép so chuỗi.
  if (connection.avatar_url && isMirrored(connection.avatar_url)) return

  const path = mediaPathForAvatar(connection.id)

  // Thử link đang lưu trước: nếu còn sống thì khỏi phiền tới API nền tảng.
  let stored = connection.avatar_url
    ? await mirrorImage(admin, connection.avatar_url, path)
    : null

  if (!stored || stored === connection.avatar_url) {
    const fresh = await fetchFreshAvatarUrl(
      connection.provider,
      accessToken,
      connection.external_account_id,
    )
    if (!fresh) return
    stored = await mirrorImage(admin, fresh, path)
    // Link vừa xin mà cũng không tải được thì bỏ qua lượt này; lượt sau thử
    // lại. Không cần bảng đếm số lần hỏng như phần thumbnail vì đây chỉ là vài
    // kết nối, không phải hàng trăm ảnh.
    if (!stored || stored === fresh) return
  }

  const { error } = await admin
    .from('connections')
    .update({ avatar_url: stored })
    .eq('id', connection.id)
  if (error) {
    console.error(`Không cập nhật được ảnh đại diện cho ${connection.id}: ${error.message}`)
  }
}
