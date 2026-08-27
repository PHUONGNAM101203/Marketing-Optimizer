import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Chép ảnh từ CDN của nền tảng về bucket `media` của chính mình, trả về URL
 * vĩnh viễn.
 *
 * Vì sao: URL thumbnail TikTok là link CÓ CHỮ KÝ và hết hạn. Đo thật trên
 * production 27/8/2026: 6/6 ảnh ở snapshot mới nhất còn sống, 0/6 ở snapshot
 * cũ nhất còn sống. Ảnh trong app hỏng dần theo thời gian, và chọn một khoảng
 * ngày cũ là vỡ hết.
 *
 * KHÔNG nén lại. TikTok/Meta đã nén sẵn thumbnail (~50-150 KB); mã hoá lại chỉ
 * bỏ thêm chi tiết mà tiết kiệm không đáng kể trên tổng ~47 MB. Lưu nguyên
 * byte là giữ được độ nét cao nhất còn tồn tại — không có cách nào làm ảnh nét
 * hơn bản gốc mà nền tảng trả về.
 */

const BUCKET = 'media'

/** Quá hạn này thì bỏ qua ảnh đó và đi tiếp. Việc chép chạy TRONG lượt đồng
 * bộ; một CDN treo không được phép giữ cả cron cho tới lúc bị Vercel giết. */
const FETCH_TIMEOUT_MS = 8_000

/** Ảnh lớn bất thường gần như chắc chắn không phải thumbnail. Chặn trước khi
 * nạp hết vào bộ nhớ. */
const MAX_BYTES = 8 * 1024 * 1024

const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

/**
 * ĐÃ THỬ VÀ KHÔNG ĐƯỢC: xin bản độ phân giải cao hơn.
 *
 * URL ảnh bìa TikTok nhúng tham số xử lý ảnh ngay trong đường dẫn, dạng
 * `~tplv-tiktokx-cropcenter-q:300:400:q70.jpeg`, nên nhìn qua tưởng chỉ cần
 * sửa `300:400` thành `1080:1440` là có ảnh nét. Ngày 27/8/2026 đã triển khai
 * đúng như vậy, có đường lui về URL gốc, rồi đo kết quả trên production: 118
 * trên 118 ảnh ra file GIỐNG HỆT TỪNG BYTE bản cũ, tức lượt xin bản lớn bị từ
 * chối trong mọi trường hợp — chữ ký `x-signature` phủ luôn phần kích thước.
 *
 * Ghi lại ở đây để không ai (kể cả tôi) thử lại: 300x400 là mức tối đa mà
 * Display API của TikTok cấp. Ảnh nhìn mờ khi mở to là do nguồn vốn nhỏ, không
 * phải do việc chép — chép lưu nguyên byte, không mã hoá lại.
 */

/** URL công khai của bucket. Tự ghép thay vì gọi `getPublicUrl()` để hàm này
 * không cần một client chỉ để dựng một chuỗi. */
export const publicMediaUrl = (path: string): string =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`

/** Đã là ảnh của chính mình thì thôi. Lượt đồng bộ chạy lại mỗi giờ và ghi đè
 * cùng những hàng đó, nên thiếu kiểm tra này là mỗi giờ lại tải + upload lại
 * toàn bộ ảnh. */
const isAlreadyMirrored = (url: string): boolean =>
  url.includes(`/storage/v1/object/public/${BUCKET}/`)

/**
 * Trả về URL nội bộ nếu chép được, ngược lại trả về NGUYÊN URL gốc.
 *
 * Không bao giờ ném lỗi: đây là việc phụ trong một lượt đồng bộ số liệu. Một
 * thumbnail hỏng không được phép làm hỏng cả lượt ghi `video_metrics_daily` —
 * ảnh vẫn dùng tạm link gốc (còn sống vài ngày) và lượt sau thử lại.
 */
export const mirrorImage = async (
  admin: SupabaseClient<Database>,
  sourceUrl: string | null | undefined,
  /** Không kèm phần mở rộng — suy từ `content-type` thật của phản hồi. */
  pathWithoutExtension: string,
): Promise<string | null> => {
  if (!sourceUrl) return sourceUrl ?? null
  if (isAlreadyMirrored(sourceUrl)) return sourceUrl

  return (await tryMirror(admin, sourceUrl, pathWithoutExtension)) ?? sourceUrl
}

/** Trả về URL nội bộ nếu chép được, `null` nếu không — nơi gọi quyết định thử
 * tiếp hay bỏ cuộc. */
const tryMirror = async (
  admin: SupabaseClient<Database>,
  sourceUrl: string,
  pathWithoutExtension: string,
): Promise<string | null> => {
  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) return null

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim()
    const extension = EXTENSION_BY_TYPE[contentType]
    // Link TikTok hết hạn KHÔNG trả 404 — nó trả 200 kèm một trang HTML nhỏ
    // (đo thật: 544 bytes, `text/html`). Chỉ dựa vào `response.ok` là sẽ upload
    // trang lỗi đó lên rồi tưởng là ảnh.
    if (!extension) return null

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null

    const path = `${pathWithoutExtension}.${extension}`
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      // Ghi đè: nền tảng có thể đổi ảnh bìa của cùng một video, và ghi đè đơn
      // giản hơn nhiều so với kiểm tra tồn tại rồi mới quyết định.
      upsert: true,
      // Ảnh là bất biến theo đường dẫn — cho trình duyệt và CDN cache dài.
      cacheControl: '31536000',
    })
    if (error) {
      console.error(`Không upload được ảnh ${path}: ${error.message}`)
      return null
    }

    return publicMediaUrl(path)
  } catch (error) {
    console.error(
      `Không chép được ảnh về Storage: ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

/** Đường dẫn ổn định theo ID của nền tảng — cùng một video luôn ra cùng một
 * đường dẫn, nên chạy lại không sinh rác. `encodeURIComponent` vì ID của Meta
 * có dạng `{pageId}_{postId}` và có thể chứa ký tự không hợp lệ trong path. */
/** `v2` là mốc phiên bản, không phải trang trí: bản v1 đã chép ở độ phân giải
 * 300x400 của TikTok. Đổi thư mục khiến mọi ảnh được chép LẠI đúng một lần ở
 * độ phân giải cao, rồi từ đó lượt đồng bộ sau bỏ qua vì đã có. Thư mục
 * `tiktok/` cũ thành rác và xoá được sau khi mọi hàng đã trỏ sang v2. */
export const mediaPathForVideo = (externalVideoId: string): string =>
  `tiktok/v2/${encodeURIComponent(externalVideoId)}`

export const mediaPathForPost = (externalPostId: string): string =>
  `meta/${encodeURIComponent(externalPostId)}`

/** Ảnh đại diện đặt theo CONNECTION, không theo ID tài khoản của nền tảng: một
 * connection luôn là một tài khoản, mà `connectionId` là UUID nên chắc chắn hợp
 * lệ trong đường dẫn, không như ID nền tảng. */
export const mediaPathForAvatar = (connectionId: string): string => `avatar/${connectionId}`
