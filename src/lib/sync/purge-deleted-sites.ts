import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Xoá THẬT những website đã xoá quá lâu.
 *
 * Xoá website chỉ đánh dấu `deleted_at` (migration 20261020000001), nên không
 * có bước này thì dữ liệu nằm lại vĩnh viễn — vừa tốn chỗ, vừa sai với ý người
 * dùng khi họ đã chủ động xoá.
 *
 * 30 ngày, cùng mốc với `purgeDisconnectedConnections`: đây là khoảng để sửa
 * sai, không phải để lưu trữ. Tới lúc này mới cho xoá lan chạy, và nó sẽ cuốn
 * theo connections cùng toàn bộ metrics — đúng như người dùng đã yêu cầu một
 * tháng trước.
 *
 * Cùng `purgeDisconnectedConnections`, đây là hai nơi DUY NHẤT trong app còn
 * xoá thật dữ liệu, và cả hai chỉ chạm tới hàng đã bị đánh dấu từ hơn 30 ngày
 * trước.
 */
const PURGE_AFTER_DAYS = 30

export const purgeDeletedSites = async (
  admin: SupabaseClient<Database>,
): Promise<number> => {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 86_400_000).toISOString()

  const { data, error } = await admin
    .from('sites')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .select('id')

  if (error) {
    console.error(`Không dọn được website đã xoá: ${error.message}`)
    return 0
  }
  return (data ?? []).length
}
