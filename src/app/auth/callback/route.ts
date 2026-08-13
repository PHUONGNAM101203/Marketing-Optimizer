import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Đích quay về sau khi xác nhận email hoặc đăng nhập bằng nhà cung cấp ngoài.
 *
 * Supabase trả về một mã dùng một lần trên query string; đổi mã đó lấy phiên
 * đăng nhập rồi ghi vào cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  // Chỉ nhận đường dẫn nội bộ. Không có kiểm tra này, ai đó gửi link
  // ?next=https://trang-lua-dao.vn và ta tự tay chuyển hướng người dùng sang đó
  // ngay sau khi họ vừa đăng nhập thành công.
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=invalid_code`)
  }

  return NextResponse.redirect(`${origin}${safeNext}`)
}
