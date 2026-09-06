import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Giữ lại kết quả báo cáo của API nền tảng trong database, và dùng bản đã lưu
 * làm lưới an toàn khi lượt gọi mới hỏng.
 *
 * Khác `unstable_cache` ở tầng provider chứ không thay thế nó: lớp kia nhanh
 * hơn (trong bộ nhớ) nhưng mất sạch sau mỗi lần triển khai và tự hết hạn, nên
 * lần nào mất cũng có một người dùng gánh trọn lượt gọi nguội. Với Klaviyo,
 * lượt nguội là bốn request TUẦN TỰ vào Reporting API bị giới hạn ~1
 * request/giây — đủ chạm trần thời gian và hiện ra lỗi thay vì số liệu.
 *
 * Ba trạng thái, theo đúng thứ tự ưu tiên:
 *   1. Có bản lưu còn tươi  -> trả luôn, KHÔNG gọi API.
 *   2. Bản lưu đã cũ        -> gọi API; thành công thì lưu đè và trả bản mới.
 *   3. Gọi API hỏng         -> trả BẢN LƯU CŨ nếu có. Số hơi cũ tốt hơn hẳn một
 *                              khung báo lỗi, và người dùng vẫn thấy được điều
 *                              họ vào để xem.
 */

/** Sáu giờ — khớp với tầng cache của provider, và thoải mái so với nhịp đồng bộ
 * một giờ. Quá hạn KHÔNG có nghĩa là vứt đi: bản cũ vẫn là đường lui khi lượt
 * gọi mới hỏng. */
const DEFAULT_TTL_SECONDS = 6 * 60 * 60

export const withReportCache = async <T>(
  admin: SupabaseClient<Database>,
  connectionId: string,
  cacheKey: string,
  fetcher: () => Promise<T>,
  /** Chỉ lưu khi lượt gọi THÀNH CÔNG thật. Nhiều hàm provider trả về
   * `{ rows: [], error }` thay vì ném lỗi — lưu nguyên cái đó thì lần sau đọc
   * ra một kết quả rỗng và không còn biết đó là lỗi. */
  isSuccess: (value: T) => boolean,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<T> => {
  const stored = await admin
    .from('provider_report_cache')
    .select('payload, fetched_at')
    .eq('connection_id', connectionId)
    .eq('cache_key', cacheKey)
    .maybeSingle()

  const storedPayload = (stored.data?.payload ?? null) as T | null
  const ageSeconds = stored.data?.fetched_at
    ? (Date.now() - new Date(stored.data.fetched_at).getTime()) / 1000
    : Number.POSITIVE_INFINITY

  if (storedPayload !== null && ageSeconds < ttlSeconds) return storedPayload

  let fresh: T
  try {
    fresh = await fetcher()
  } catch (error) {
    console.error(
      `Lượt gọi báo cáo hỏng (${cacheKey}): ${error instanceof Error ? error.message : String(error)}`,
    )
    if (storedPayload !== null) return storedPayload
    throw error
  }

  if (!isSuccess(fresh)) return storedPayload ?? fresh

  const { error } = await admin.from('provider_report_cache').upsert(
    {
      connection_id: connectionId,
      cache_key: cacheKey,
      payload: fresh as never,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'connection_id,cache_key' },
  )
  // Không ném: lưu hỏng chỉ làm lần sau phải gọi lại, không ảnh hưởng số vừa lấy.
  if (error) console.error(`Không lưu được báo cáo ${cacheKey}: ${error.message}`)

  return fresh
}
