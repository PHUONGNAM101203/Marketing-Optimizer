import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { LAST_SITE_COOKIE, parseLastSiteCookie } from '@/lib/last-site-cookie'

/**
 * Làm mới phiên đăng nhập trên mỗi request và chặn các route cần đăng nhập.
 *
 * Server Component KHÔNG ghi được cookie, nên nếu chỉ dựa vào chúng thì access
 * token hết hạn sẽ không bao giờ được làm mới và người dùng bị đăng xuất giữa
 * chừng. Proxy là chỗ duy nhất trong Next.js vừa đọc vừa ghi được cookie
 * trước khi trang render.
 */

/**
 * `/api/cron` PHẢI ở đây: Vercel Cron gọi route này server-to-server, không
 * kèm cookie phiên đăng nhập nào — thiếu ngoại lệ này thì `user` luôn `null`,
 * proxy redirect thẳng sang `/sign-in` TRƯỚC KHI request chạm tới code kiểm
 * tra `CRON_SECRET` trong route handler, khiến cron "chạy" (Vercel thấy
 * response 307, không phải lỗi) nhưng không đồng bộ được gì — đúng bug thật
 * đã xảy ra (`/api/cron/sync-all` không cập nhật `last_synced_at` của bất kỳ
 * connection nào suốt nhiều ngày, xác nhận qua Vercel Observability: 0 lượt
 * gọi trong khung giờ lịch chạy). Route tự xác thực bằng header
 * `Authorization: Bearer $CRON_SECRET` (xem route handler), không cần —
 * và không thể có — phiên Supabase.
 */
const PUBLIC_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/auth',
  '/_next',
  '/favicon',
  '/privacy',
  '/terms',
  '/api/cron',
]

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

  // Mở app từ màn hình chính luôn vào `/` (`start_url` trong `manifest.ts`).
  // Trang `/` phải xác thực, đọc danh sách site, đọc `last_site_id` rồi mới
  // `redirect()` — và redirect bắt trình duyệt đi thêm một vòng HTTP nữa, nên
  // mở app tốn HAI lượt gọi hàm server thay vì một, mỗi lượt đều có thể dính
  // cold start.
  //
  // Ở đây đã biết người dùng là ai và đang ở edge (không có lượt gọi hàm nào),
  // nên nếu cookie có site mở gần nhất thì chuyển hướng thẳng, bỏ hẳn lượt
  // đầu. Cookie sai/hết hạn thì rơi về đường cũ — trang `/` vẫn xử lý đúng.
  if (user && pathname === '/') {
    const lastSiteId = parseLastSiteCookie(request.cookies.get(LAST_SITE_COOKIE)?.value)
    if (lastSiteId) {
      const target = request.nextUrl.clone()
      target.pathname = `/${lastSiteId}/overview`

      // PHẢI chép cookie từ `response` sang. `getUser()` ở trên có thể vừa
      // làm mới access token và ghi cookie mới vào `response` (xem `setAll`);
      // `NextResponse.redirect()` tạo một response HOÀN TOÀN MỚI, không mang
      // theo gì. Trả thẳng nó đi là vứt luôn token vừa làm mới — lượt sau
      // dùng lại token cũ đã hết hạn và người dùng bị đăng xuất giữa chừng,
      // đúng lớp lỗi mà `proxy.ts` sinh ra để tránh.
      //
      // Nhánh redirect sang `/sign-in` bên dưới không cần việc này: ở đó
      // `user` là null, không có phiên nào để giữ.
      const redirectResponse = NextResponse.redirect(target)
      for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie)
      return redirectResponse
    }
  }

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
     * gian mà không kiểm tra gì. `.txt`/`.html` cũng loại trừ ở đây — đó là
     * hai định dạng file xác minh sở hữu domain (TikTok Developer Portal
     * dùng .txt, Google Search Console có thể dùng .html) đặt thẳng trong
     * `public/`; trình xác minh của các nền tảng đó gọi KHÔNG kèm cookie
     * đăng nhập, nên nếu proxy chặn thì xác minh domain sẽ luôn thất bại.
     *
     * `icon`/`apple-icon`/`manifest.webmanifest` là Route Handler do
     * icon.tsx/apple-icon.tsx/manifest.ts SINH RA, không phải file tĩnh nên
     * không khớp nhóm phần mở rộng ở trên — thiếu chúng ở đây thì trình
     * duyệt của người CHƯA đăng nhập (vd. đang ở /sign-in) xin favicon sẽ bị
     * proxy chuyển hướng sang /sign-in?next=/icon thay vì nhận về ảnh, tab
     * trình duyệt không hiện logo cho tới khi đăng nhập xong.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|txt|html)$).*)',
  ],
}
