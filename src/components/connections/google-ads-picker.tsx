import Link from 'next/link'
import { AlertCircle, ShieldPlus } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConnectGoogleAdsButton } from './connect-google-ads-button'
import { listAvailableGoogleAdsAccounts } from '@/lib/data/google-ads-accounts'
import { createClient } from '@/lib/supabase/server'

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'no-google-connection':
    'Kết nối Google (GA4, Search Console...) trước — Ads dùng chung quyền với các sản phẩm đó.',
  'no-developer-token':
    'Chưa có Developer Token. Mở "Cập nhật OAuth app" ở thẻ Google bên trên để nhập.',
  'app-not-configured': 'Chưa cấu hình OAuth app cho Google.',
  'expired-no-refresh': 'Quyền truy cập Google đã hết hạn — kết nối lại ở thẻ Google bên trên.',
  'developer-token-test-only':
    'Developer Token đang ở mức "Test" — chỉ gọi được tài khoản test của Google Ads, chưa gọi được tài khoản thật. Xin nâng lên "Basic Access" tại ads.google.com → Tools & Settings → API Center.',
}

/**
 * Danh sách tài khoản Google Ads có thể kết nối — chỉ hiện khi ĐÃ có
 * connection Google khác và ĐÃ nhập Developer Token. Ads không tự động dò
 * domain được như GA4/GSC (xem `lib/data/google-ads-accounts.ts`), nên đây
 * là nơi người dùng tự chọn đúng tài khoản.
 */
export async function GoogleAdsPicker({ siteId }: { readonly siteId: string }) {
  const result = await listAvailableGoogleAdsAccounts(siteId)

  if (!result.ok) {
    // Chưa đủ điều kiện để thử — chưa có gì đáng hiện ở đây, badge "Chờ
    // duyệt token" trong ConnectPanel đã nói đủ cho trường hợp phổ biến nhất.
    if (result.error === 'no-google-connection' || result.error === 'no-developer-token') {
      return null
    }

    // Access token mượn từ GA4/GSC/GTM/YouTube chưa từng xin quyền `adwords`
    // — CỐ Ý, không xin thừa quyền cho người không cần (xem google.ts). Cần
    // một lượt cấp quyền RIÊNG, chỉ khi người dùng thật sự muốn dùng Ads.
    if (result.error === 'insufficient-scope') {
      return (
        <Card className="flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <ShieldPlus aria-hidden className="size-5 shrink-0 text-[var(--color-signal)]" />
            <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
              Cần cấp thêm quyền để đọc Google Ads — quyền này tách riêng khỏi GA4/Search Console,
              chỉ xin khi bạn thật sự cần.
            </p>
          </div>
          <Button asChild variant="primary" size="sm">
            <Link href={`/api/oauth/google/start?siteId=${siteId}&upgrade=ads`}>
              Cấp quyền Google Ads
            </Link>
          </Button>
        </Card>
      )
    }

    return (
      <Card className="flex items-start gap-3 p-5">
        <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--color-caution)]" />
        <div>
          <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
            {ERROR_MESSAGES[result.error] ??
              `Không lấy được danh sách tài khoản Google Ads (${result.error}).`}
          </p>
          {result.detail ? (
            <p className="mt-1 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
              Google báo: {result.detail}
            </p>
          ) : null}
        </div>
      </Card>
    )
  }

  if (result.accounts.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-5">
        <AlertCircle aria-hidden className="size-5 shrink-0 text-[var(--color-caution)]" />
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          Tài khoản Google này chưa quản lý tài khoản Google Ads nào.
        </p>
      </Card>
    )
  }

  const supabase = await createClient()
  const { data: connected } = await supabase
    .from('connections')
    .select('external_account_id')
    .eq('site_id', siteId)
    .eq('provider', 'google-ads')

  const connectedIds = new Set((connected ?? []).map((row) => row.external_account_id))

  return (
    <Card>
      <CardHeader
        title="Chọn tài khoản Google Ads"
        description="Ads không tự dò được domain như GA4/Search Console — chọn đúng tài khoản quản lý website này."
      />
      <ul className="flex flex-col divide-y divide-[var(--color-rule)] px-5 pb-4">
        {result.accounts.map((account) => (
          <li
            key={account.customerId}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                {account.descriptiveName}
              </p>
              <p className="truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                {account.customerId}
              </p>
            </div>
            <ConnectGoogleAdsButton
              siteId={siteId}
              customerId={account.customerId}
              accountName={account.descriptiveName}
              alreadyConnected={connectedIds.has(account.customerId)}
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}
