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

/**
 * Kích thước ảnh, đọc từ HEADER — không giải mã cả tấm ảnh.
 *
 * Lưới chấp nhận ảnh từ CDN của bên thứ ba, và không có gì bảo đảm thứ nhận
 * được là một ảnh bìa bình thường. Ảnh quá khổ hoặc tỉ lệ khung dị thường sẽ
 * ngốn bộ nhớ của trình duyệt và hiển thị méo, mà chặn bằng dung lượng thì
 * không phát hiện được (một ảnh vài chục megapixel vẫn có thể nén rất nhỏ).
 *
 * Đây là lưới an toàn, chưa từng chặn ca thật nào: mọi ảnh đo được tới ngày
 * 27/8/2026 đều nằm trong khoảng 300x400 tới 1500x2000. Giữ lại vì chi phí
 * bằng không — chỉ đọc vài chục byte đầu, không giải mã ảnh.
 */
const readImageSize = (bytes: Uint8Array): { width: number; height: number } | null => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // PNG: 8 byte chữ ký, rồi chunk IHDR có rộng/cao ở offset cố định.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }

  // JPEG: duyệt các marker tới khối SOF (Start Of Frame) chứa kích thước.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset < bytes.length - 9) {
      if (bytes[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = bytes[offset + 1]!
      // SOF0/1/2/3 — các biến thể còn lại (SOF4+) không dùng cho ảnh thường.
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
      }
      // Marker không có phần thân: bỏ qua 2 byte.
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2
        continue
      }
      offset += 2 + view.getUint16(offset + 2)
    }
  }

  // WebP/AVIF/GIF: không đọc được ở đây, và cũng chưa gặp ca bất thường nào —
  // trả `null` nghĩa là "không biết", nơi gọi cho qua thay vì loại nhầm.
  return null
}

/** Trần kích thước cho một ảnh bìa/đại diện. 4000px là rộng rãi so với ảnh gốc
 * đo được (1440x2560), còn tỉ lệ thì chặn đúng thứ cần chặn: ảnh bìa video nằm
 * quanh 9:16 hoặc 16:9, một dải sprite thì lệch hàng chục lần. */
const MAX_DIMENSION = 4000
const MAX_ASPECT_RATIO = 3

const looksLikeCoverImage = (bytes: Uint8Array): boolean => {
  const size = readImageSize(bytes)
  if (!size || !size.width || !size.height) return true
  if (size.width > MAX_DIMENSION || size.height > MAX_DIMENSION) return false
  const ratio = size.width / size.height
  return ratio <= MAX_ASPECT_RATIO && ratio >= 1 / MAX_ASPECT_RATIO
}

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
  options?: {
    /** Trần riêng, chặt hơn `MAX_BYTES`, cho nguồn ảnh mà nơi gọi CÓ đường lui.
     * Dùng cho ảnh gốc TikTok: trung vị 114 KB nhưng đo được hai ảnh PNG 2,8 và
     * 3,2 MB — nặng gấp hai mươi lần phần còn lại chỉ để hiển thị trong một ô
     * rộng 300px. Vượt trần thì nơi gọi quay về ảnh 300x400 của Display API. */
    readonly maxBytes?: number
  },
): Promise<string | null> => {
  if (!sourceUrl) return sourceUrl ?? null
  if (isAlreadyMirrored(sourceUrl)) return sourceUrl

  return (await tryMirror(admin, sourceUrl, pathWithoutExtension, options?.maxBytes)) ?? sourceUrl
}

/** Trả về URL nội bộ nếu chép được, `null` nếu không — nơi gọi quyết định thử
 * tiếp hay bỏ cuộc. */
const tryMirror = async (
  admin: SupabaseClient<Database>,
  sourceUrl: string,
  pathWithoutExtension: string,
  maxBytes: number = MAX_BYTES,
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
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null
    if (!looksLikeCoverImage(bytes)) {
      console.error(`Bỏ qua ảnh có kích thước bất thường: ${pathWithoutExtension}`)
      return null
    }

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
/** Số phiên bản trong đường dẫn là mốc để chép LẠI toàn bộ ảnh đúng một lần,
 * rồi từ đó lượt đồng bộ sau bỏ qua vì đã có (xem chỗ kiểm tra trong
 * `sync-video-snapshots.ts`). v1 và v2 đều là ảnh 300x400 của Display API; v3
 * là ảnh gốc lấy qua oEmbed, xem `fetchTiktokOriginalThumbnail`. Thư mục của
 * phiên bản cũ thành rác và xoá được sau khi mọi hàng đã trỏ sang bản mới. */
export const mediaPathForVideo = (externalVideoId: string): string =>
  `tiktok/v3/${encodeURIComponent(externalVideoId)}`

/** Số phiên bản để chép lại toàn bộ đúng một lần khi nguồn ảnh đổi.
 * v1: `full_picture` của Facebook và `media_url` của Instagram — ảnh thu nhỏ,
 *     và bài Instagram dạng video thì không có ảnh nào cả.
 * v2: thêm `attachments{media{image{src}}}` cho Facebook — đo ra ĐÚNG CÙNG một
 *     tấm ảnh, không cải thiện gì (giữ lại vì vẫn là nguồn đúng đắn hơn).
 * v3: hỏi thẳng node ảnh để lấy bản gốc — xem `fetchFacebookOriginalPhoto`. */
export const mediaPathForPost = (externalPostId: string): string =>
  `meta/v3/${encodeURIComponent(externalPostId)}`

/** Ảnh đại diện đặt theo CONNECTION, không theo ID tài khoản của nền tảng: một
 * connection luôn là một tài khoản, mà `connectionId` là UUID nên chắc chắn hợp
 * lệ trong đường dẫn, không như ID nền tảng. */
export const mediaPathForAvatar = (connectionId: string): string => `avatar/${connectionId}`
