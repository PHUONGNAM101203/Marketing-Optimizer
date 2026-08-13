import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { getSite } from '@/lib/data/sites'
import { getSiteOAuthCredentials } from '@/lib/data/site-oauth-apps'
import { isProviderFamily } from '@/lib/domain/providers'
import { OAUTH_ADAPTERS } from '@/lib/providers'
import { GOOGLE_ADS_SCOPE, GOOGLE_MERCHANT_SCOPE } from '@/lib/providers/google'
import { META_ADS_SCOPE } from '@/lib/providers/meta'

export const OAUTH_STATE_COOKIE = 'oauth_state'

/**
 * Điểm bắt đầu luồng OAuth thật.
 *
 * `state` gói siteId ngay trong giá trị gửi cho Google (`<ngẫu nhiên>.<siteId>`)
 * và được lưu lại nguyên văn trong cookie httpOnly. Callback so khớp CHÍNH XÁC
 * giá trị Google trả về với cookie — không tin bất kỳ tham số nào khác trên
 * URL. Cookie httpOnly nên chỉ server này đặt được nó; so khớp đúng là bằng
 * chứng request quay lại từ chính lượt đăng nhập ta vừa khởi tạo, chống CSRF.
 */
export async function GET(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly family: string }> },
) {
  const { family } = await context.params
  const siteId = request.nextUrl.searchParams.get('siteId')
  // "ads" / "merchant-center" = NÂNG quyền một connection Google đã có sẵn —
  // không dò lại tài sản, chỉ ghi đè token (xem nhánh `mode` ở callback).
  const upgrade = request.nextUrl.searchParams.get('upgrade')
  // Ngược lại, đây là lượt kết nối Google ĐẦU TIÊN của Site, người dùng tự
  // báo trước "website này có chạy Ads/Merchant Center" (checkbox ở
  // ConnectPanel) — vẫn dò tài sản như bình thường (GA4/GSC/GTM/YouTube),
  // chỉ thêm quyền vào CÙNG một màn hình chấp thuận thay vì xin lại lần hai.
  const wantsAds = request.nextUrl.searchParams.get('adsScope') === '1'
  const wantsMerchant = request.nextUrl.searchParams.get('merchantScope') === '1'
  const wantsMetaAds = request.nextUrl.searchParams.get('metaAdsScope') === '1'

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.redirect(new URL('/sign-in', request.nextUrl.origin))
  }

  if (!siteId || !isProviderFamily(family)) {
    return NextResponse.redirect(new URL('/', request.nextUrl.origin))
  }

  const site = await getSite(siteId)
  if (!site) {
    // RLS lọc: không đọc được nghĩa là không phải thành viên Site này.
    return NextResponse.redirect(new URL('/', request.nextUrl.origin))
  }

  const adapter = OAUTH_ADAPTERS[family]
  if (!adapter) {
    const target = new URL(`/${siteId}/connections`, request.nextUrl.origin)
    target.searchParams.set('oauth_error', 'family-not-ready')
    return NextResponse.redirect(target)
  }

  const credentials = await getSiteOAuthCredentials(siteId, family)
  if (!credentials) {
    const target = new URL(`/${siteId}/connections`, request.nextUrl.origin)
    target.searchParams.set('oauth_error', 'app-not-configured')
    return NextResponse.redirect(target)
  }

  const mode = upgrade === 'ads' || upgrade === 'merchant-center' ? upgrade : ''
  const state = `${randomBytes(24).toString('hex')}.${siteId}.${mode}`
  const redirectUri = new URL(`/api/oauth/${family}/callback`, request.nextUrl.origin).toString()

  const extraScopes: string[] = []
  if (family === 'google' && (upgrade === 'ads' || wantsAds)) extraScopes.push(GOOGLE_ADS_SCOPE)
  if (family === 'google' && (upgrade === 'merchant-center' || wantsMerchant)) {
    extraScopes.push(GOOGLE_MERCHANT_SCOPE)
  }
  if (family === 'meta' && wantsMetaAds) extraScopes.push(META_ADS_SCOPE)

  const response = NextResponse.redirect(
    adapter.authorizeUrl({
      credentials,
      state,
      redirectUri,
      extraScopes: extraScopes.length > 0 ? extraScopes : undefined,
    }),
  )
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/api/oauth',
    maxAge: 600,
  })
  return response
}
