import { AlertCircle } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/card'
import { ConnectMetaAdsButton } from './connect-meta-ads-button'
import { listAvailableMetaAdsAccounts } from '@/lib/data/meta-ads-accounts'
import { createClient } from '@/lib/supabase/server'

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'no-meta-connection':
    'Kết nối Instagram trước — Facebook Ads dùng chung quyền với Instagram (chưa có cách xin quyền Ads độc lập với Meta khi site chưa dùng Instagram).',
  'app-not-configured': 'Chưa cấu hình OAuth app cho Meta.',
  'expired-no-refresh': 'Quyền truy cập Meta đã hết hạn — kết nối lại ở thẻ Meta bên trên.',
}

/**
 * Danh sách tài khoản Facebook Ads có thể kết nối — chỉ hiện khi ĐÃ có
 * connection Instagram (Ads không tự dò được domain, xem
 * `lib/data/meta-ads-accounts.ts`). Cùng vai trò với `GoogleAdsPicker`.
 */
export async function MetaAdsPicker({ siteId }: { readonly siteId: string }) {
  const result = await listAvailableMetaAdsAccounts(siteId)

  if (!result.ok) {
    // Chưa đủ điều kiện để thử — chưa kết nối Instagram thì chưa có gì đáng
    // hiện ở đây, tránh một thẻ lỗi thường trực cho site không dùng Meta.
    if (result.error === 'no-meta-connection') return null

    return (
      <Card className="flex items-start gap-3 p-5">
        <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--color-caution)]" />
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          {ERROR_MESSAGES[result.error] ??
            `Không lấy được danh sách tài khoản Facebook Ads (${result.error}).`}
        </p>
      </Card>
    )
  }

  if (result.accounts.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-5">
        <AlertCircle aria-hidden className="size-5 shrink-0 text-[var(--color-caution)]" />
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          Tài khoản Meta này chưa quản lý tài khoản Facebook Ads nào.
        </p>
      </Card>
    )
  }

  const supabase = await createClient()
  const { data: connected } = await supabase
    .from('connections')
    .select('external_account_id')
    .eq('site_id', siteId)
    .eq('provider', 'meta-ads')

  const connectedIds = new Set((connected ?? []).map((row) => row.external_account_id))

  return (
    <Card>
      <CardHeader
        title="Chọn tài khoản Facebook Ads"
        description="Ads không tự dò được domain như Instagram — chọn đúng tài khoản quản lý website này."
      />
      <ul className="flex flex-col divide-y divide-[var(--color-rule)] px-5 pb-4">
        {result.accounts.map((account) => (
          <li key={account.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                {account.name}
              </p>
              <p className="truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                {account.id}
              </p>
            </div>
            <ConnectMetaAdsButton
              siteId={siteId}
              adAccountId={account.id}
              accountName={account.name}
              alreadyConnected={connectedIds.has(account.id)}
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}
