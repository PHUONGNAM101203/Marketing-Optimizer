import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Xoá THẬT những kết nối đã gỡ quá lâu.
 *
 * Gỡ kết nối chỉ đánh dấu `disconnected_at` (xem migration 20260907000001), nên
 * nếu không có bước này thì dữ liệu của kết nối đã gỡ nằm lại vĩnh viễn — vừa
 * tốn chỗ, vừa sai với ý người dùng khi họ đã chủ động gỡ.
 *
 * 30 ngày là khoảng để sửa sai, không phải để lưu trữ. Đủ dài cho một cú bấm
 * nhầm hay một sự cố như ngày 7/9/2026 (phát hiện sau vài giờ), đủ ngắn để
 * không giữ mãi thứ người dùng đã bỏ.
 *
 * Đây là NƠI DUY NHẤT trong app còn xoá thật một kết nối, và nó chỉ chạm tới
 * hàng đã bị đánh dấu từ hơn 30 ngày trước — không có đường nào để một lỗi
 * logic biến thành mất dữ liệu tức thì như trước.
 */
const PURGE_AFTER_DAYS = 30

export const purgeDisconnectedConnections = async (
  admin: SupabaseClient<Database>,
): Promise<number> => {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 86_400_000).toISOString()

  const { data, error } = await admin
    .from('connections')
    .delete()
    .not('disconnected_at', 'is', null)
    .lt('disconnected_at', cutoff)
    .select('id')

  if (error) {
    console.error(`Không dọn được kết nối đã gỡ: ${error.message}`)
    return 0
  }
  return (data ?? []).length
}
