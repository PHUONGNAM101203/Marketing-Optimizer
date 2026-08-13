import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Làm mới phiên đăng nhập trên mỗi request và chặn các route cần đăng nhập.
 *
 * Server Component KHÔNG ghi được cookie, nên nếu chỉ dựa vào chúng thì access
 * token hết hạn sẽ không bao giờ được làm mới và người dùng bị đăng xuất giữa
 * chừng. Proxy là chỗ duy nhất trong Next.js vừa đọc vừa ghi được cookie
 * trước khi trang render.
 */

const PUBLIC_PREFIXES = ['/sign-in', '/sign-up', '/auth', '/_next', '/favicon']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Chưa cấu hình Supabase (giai đoạn M1 với dữ liệu mẫu) — cho qua hết.
  // Chặn ở đây khi chưa có backend sẽ khoá luôn cả prototype.
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Bắt buộc gọi getUser() ở đây: chính lời gọi này kích hoạt việc làm mới
  // token và ghi cookie mới qua setAll ở trên.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/sign-in'
    // Nhớ chỗ người dùng định đến, để sau khi đăng nhập đưa họ về đúng đó.
    redirectUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Bỏ qua tài nguyên tĩnh và ảnh — chạy proxy cho chúng chỉ tốn thời
     * gian mà không kiểm tra gì.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
}
