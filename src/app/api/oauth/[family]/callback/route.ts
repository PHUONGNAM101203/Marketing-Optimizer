import { NextResponse, type NextRequest } from 'next/server'
import { encrypt } from '@/lib/crypto'
import { getSite } from '@/lib/data/sites'
import { getSiteOAuthCredentials } from '@/lib/data/site-oauth-apps'
import { isProviderFamily } from '@/lib/domain/providers'
import { OAUTH_ADAPTERS } from '@/lib/providers'
import { discoverMerchantCenterAccounts } from '@/lib/providers/google-discovery'
import { syncConnection } from '@/lib/sync/sync-connection'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { OAUTH_STATE_COOKIE } from '../start/route'

/**
 * Đích Google (và sau này Meta/TikTok) quay lại sau khi người dùng chấp
 * thuận. Đổi mã lấy token, dò tài sản (property GA4, site Search Console…),
 * mã hoá token rồi ghi vào `connections` + `connection_secrets`.
 *
 * Ghi `connections` bằng client PHIÊN NGƯỜI DÙNG (chịu RLS) — chỉ
 * owner/admin của Site mới chèn được, đúng ý đồ bảo mật đã thiết kế. Ghi
 * `connection_secrets` bằng client `service_role` vì bảng đó cố tình không có
 * policy nào cho vai trò thường.
 */
export async function GET(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly family: string }> },
) {
  const { family } = await context.params
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const returnedState = searchParams.get('state')
  const oauthError = searchParams.get('error')

  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value

  const failure = (reason: string, siteId?: string) => {
    const target = siteId
      ? new URL(`/${siteId}/connections`, request.nextUrl.origin)
      : new URL('/', request.nextUrl.origin)
    target.searchParams.set('oauth_error', reason)
    const response = NextResponse.redirect(target)
    response.cookies.delete(OAUTH_STATE_COOKIE)
    return response
  }

  if (!isProviderFamily(family)) return failure('unknown-family')
  const adapter = OAUTH_ADAPTERS[family]
  if (!adapter) return failure('family-not-ready')

  // Người dùng bấm "Huỷ" trên màn hình chấp thuận của Google.
  if (oauthError) return failure('denied')
  if (!code || !returnedState) return failure('missing-code')

  // So khớp CHÍNH XÁC với cookie httpOnly ta đặt ở /start — chỉ server này đặt
  // được cookie đó, nên khớp đúng là bằng chứng request bắt nguồn từ chính
  // lượt đăng nhập ta vừa khởi tạo.
  if (returnedState !== expectedState) return failure('invalid_state')

  // state = "<hex>.<siteId>.<mode>" — mode rỗng ở lượt kết nối thường, "ads"
  // hoặc "merchant-center" ở lượt nâng quyền riêng (xem /start).
  const [, siteId, mode] = returnedState.split('.')
  if (!siteId) return failure('invalid_state')

  const user = await getCurrentUser()
  if (!user) return failure('unauthenticated', siteId)

  const site = await getSite(siteId)
  if (!site) return failure('site-not-found')

  const credentials = await getSiteOAuthCredentials(siteId, family)
  if (!credentials) return failure('app-not-configured', siteId)

  try {
    const redirectUri = new URL(
      `/api/oauth/${family}/callback`,
      request.nextUrl.origin,
    ).toString()
    const tokens = await adapter.exchangeCode({ credentials, code, redirectUri })

    // Nâng quyền Ads/Merchant Center: KHÔNG tạo connection MỚI cho quyền —
    // chỉ ghi đè token (giờ mang thêm scope) vào một connection Google đã có
    // sẵn của Site này, cả hai dùng lại đúng connection đó khi kéo báo cáo.
    // Ads vẫn cần người dùng tự chọn tài khoản (không có domain qua API);
    // Merchant Center dò được domain nên tự kết nối luôn bên dưới.
    if (mode === 'ads' || mode === 'merchant-center') {
      const admin = createAdminClient()
      const { data: existing } = await admin
        .from('connections')
        .select('id')
        .eq('site_id', siteId)
        .in('provider', ['ga4', 'gsc', 'gtm', 'youtube'])
        .limit(1)
        .maybeSingle()

      if (!existing) return failure('no-google-connection', siteId)

      const { error: secretError } = await admin
        .from('connection_secrets')
        .update({
          access_token_enc: encrypt(tokens.accessToken),
          refresh_token_enc: tokens.refreshToken
            ? encrypt(tokens.refreshToken)
            : undefined,
          expires_at: tokens.expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('connection_id', existing.id)

      if (secretError) return failure('secret-write-failed', siteId)

      if (mode === 'merchant-center') {
        const matches = await discoverMerchantCenterAccounts(tokens.accessToken, site.domain)
        // Quyền vừa cấp thành công không có nghĩa là TÌM RA tài khoản khớp
        // domain — hai việc khác nhau. Báo rõ "không tìm thấy" thay vì im
        // lặng redirect về banner "thành công" trong khi chẳng có gì mới.
        if (matches.length === 0) return failure('no-accounts', siteId)

        const supabase = await createClient()
        for (const account of matches) {
          const { data: connection } = await supabase
            .from('connections')
            .upsert(
              {
                site_id: siteId,
                provider: account.provider,
                external_account_id: account.externalAccountId,
                account_name: account.accountName,
                status: 'syncing',
                scopes: [...adapter.scopes, 'https://www.googleapis.com/auth/content'],
                connected_by: user.id,
                connected_at: new Date().toISOString(),
              },
              { onConflict: 'site_id,provider,external_account_id' },
            )
            .select('id')
            .single()
          if (!connection) continue

          await admin.from('connection_secrets').upsert({
            connection_id: connection.id,
            access_token_enc: encrypt(tokens.accessToken),
            refresh_token_enc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
            expires_at: tokens.expiresAt,
            updated_at: new Date().toISOString(),
          })

          await syncConnection(connection.id)
        }
      }

      const target = new URL(`/${siteId}/connections`, request.nextUrl.origin)
      target.searchParams.set(
        'oauth_connected',
        mode === 'ads' ? 'google-ads-upgrade' : 'merchant-center-upgrade',
      )
      const response = NextResponse.redirect(target)
      response.cookies.delete(OAUTH_STATE_COOKIE)
      return response
    }

    const accounts = await adapter.listAccounts(tokens.accessToken, site.domain)

    if (accounts.length === 0) return failure('no-accounts', siteId)

    const supabase = await createClient()
    const admin = createAdminClient()
    let connected = 0

    for (const account of accounts) {
      const { data: connection, error: connectionError } = await supabase
        .from('connections')
        .upsert(
          {
            site_id: siteId,
            provider: account.provider,
            external_account_id: account.externalAccountId,
            account_name: account.accountName,
            avatar_url: account.avatarUrl ?? null,
            status: 'syncing',
            scopes: adapter.scopes as string[],
            connected_by: user.id,
            connected_at: new Date().toISOString(),
          },
          { onConflict: 'site_id,provider,external_account_id' },
        )
        .select('id')
        .single()

      // Không phải owner/admin của Site → RLS chặn (42501). Dừng ngay, báo
      // đúng lý do thay vì để lỗi bò tiếp xuống từng account còn lại.
      if (connectionError || !connection) {
        return failure(
          connectionError?.code === '42501' ? 'forbidden' : 'connection-write-failed',
          siteId,
        )
      }

      const { error: secretError } = await admin.from('connection_secrets').upsert({
        connection_id: connection.id,
        access_token_enc: encrypt(tokens.accessToken),
        refresh_token_enc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
        expires_at: tokens.expiresAt,
        updated_at: new Date().toISOString(),
      })

      if (secretError) return failure('secret-write-failed', siteId)
      connected += 1

      // Đồng bộ ngay — người dùng vừa kết nối xong thì phải thấy số liệu
      // thật ngay, không phải đợi một cron job chưa tồn tại. syncConnection
      // tự bắt lỗi của chính nó (ghi status='error' vào connection), không
      // throw ra ngoài, nên không cần try/catch ở đây.
      await syncConnection(connection.id)
    }

    const target = new URL(`/${siteId}/connections`, request.nextUrl.origin)
    target.searchParams.set('oauth_connected', family)
    target.searchParams.set('count', String(connected))
    const response = NextResponse.redirect(target)
    response.cookies.delete(OAUTH_STATE_COOKIE)
    return response
  } catch {
    return failure('exchange-failed', siteId)
  }
}
