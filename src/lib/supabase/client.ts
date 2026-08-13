'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

/**
 * Client phía trình duyệt.
 *
 * Chỉ dùng khoá `anon`, và khoá này công khai theo thiết kế — nó không cấp
 * quyền gì. Toàn bộ quyền truy cập do RLS quyết định dựa trên phiên đăng nhập
 * kèm theo. Đây là lý do RLS phải đúng: nó là hàng phòng thủ duy nhất, không
 * phải hàng thứ hai.
 */
export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  )
