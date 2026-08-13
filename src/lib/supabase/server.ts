import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'
import { publicEnv } from './env'

/**
 * Client phía server, đọc phiên đăng nhập từ cookie.
 *
 * Dùng khoá `anon`, KHÔNG dùng `service_role` — nghĩa là mọi truy vấn qua
 * client này vẫn chịu RLS. Đó là điều ta muốn: quyền được thực thi ở tầng
 * database, không phụ thuộc việc mã ứng dụng có nhớ kiểm tra hay không.
 */
export const createClient = async () => {
  const cookieStore = await cookies()
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = publicEnv()

  return createServerClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Component không ghi được cookie. Bỏ qua an toàn vì
            // proxy đã làm việc làm mới phiên rồi.
          }
        },
      },
    },
  )
}

/**
 * Người dùng hiện tại, hoặc null.
 *
 * Dùng `getUser()` chứ KHÔNG dùng `getSession()`: `getSession()` đọc thẳng từ
 * cookie mà không xác thực chữ ký, nên dữ liệu nó trả về có thể bị giả mạo.
 * `getUser()` gọi sang Supabase Auth để xác minh. Chậm hơn một chút, và đó là
 * cái giá đúng cho một quyết định phân quyền.
 */
export const getCurrentUser = async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
