import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { publicEnv } from './env'
import { serverEnv } from './env'

/**
 * Client dùng khoá `service_role` — BỎ QUA TOÀN BỘ RLS.
 *
 * `import 'server-only'` ở dòng đầu là hàng rào thật, không phải ghi chú: nếu
 * có ai lỡ import file này từ một Client Component, `next build` sẽ ĐỔ chứ
 * không âm thầm nhét khoá vào bundle gửi xuống trình duyệt.
 *
 * Chỉ dùng cho:
 *   · job đồng bộ chạy nền (cron), nơi không có phiên người dùng nào
 *   · đọc/ghi bảng `connection_secrets`, bảng cố tình không có policy nào
 *
 * TUYỆT ĐỐI KHÔNG dùng để phục vụ request của người dùng. Mỗi lần dùng nó là
 * một lần ta tự tay tắt hệ thống phân quyền — phải có lý do cụ thể viết ra.
 */
export const createAdminClient = () => {
  const { NEXT_PUBLIC_SUPABASE_URL } = publicEnv()
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv()

  return createSupabaseClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // Không lưu, không tự làm mới: client này không thuộc về người dùng nào.
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}
