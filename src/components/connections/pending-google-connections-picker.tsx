import { Card, CardHeader } from '@/components/ui/card'
import { ProviderMark } from '@/components/connections/provider-mark'
import { PendingGoogleConnectionRow } from '@/components/connections/pending-google-connection-row'
import { listPendingGoogleConnections } from '@/lib/data/pending-google-connections'
import { PROVIDER_META } from '@/lib/domain/providers'

/**
 * Ứng viên GA4/Search Console/Tag Manager chưa được xác nhận — chỉ có hàng
 * nào đó khi lượt cấp quyền Google gần nhất KHÔNG tự khớp được domain nào
 * (xem migration `pending_google_connections` + OAuth callback route). Once
 * người dùng xác nhận hoặc bỏ qua hết, bảng rỗng và component này tự ẩn.
 */
export async function PendingGoogleConnectionsPicker({ siteId }: { readonly siteId: string }) {
  const pending = await listPendingGoogleConnections(siteId)
  if (pending.length === 0) return null

  return (
    <Card tone="critical">
      <CardHeader
        title="Chọn đúng tài sản muốn kết nối"
        description="Không có cái nào khớp domain website tự động — đây là toàn bộ GA4/Search Console/Tag Manager tài khoản Google đó nhìn thấy được. Chọn đúng cái, hoặc bỏ qua nếu không phải website này."
      />
      <ul className="flex flex-col divide-y divide-[var(--color-rule)] px-5 pb-4">
        {pending.map((candidate) => (
          <li key={candidate.id} className="flex items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <ProviderMark provider={candidate.provider} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                  {candidate.accountName}
                </p>
                <p className="truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                  {PROVIDER_META[candidate.provider].label}
                  {candidate.detail ? ` · ${candidate.detail}` : ''}
                </p>
              </div>
            </div>
            <PendingGoogleConnectionRow pendingId={candidate.id} />
          </li>
        ))}
      </ul>
    </Card>
  )
}
