import { AlertCircle } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/card'
import { ConnectGtmButton } from './connect-gtm-button'
import { listAvailableGtmContainers } from '@/lib/data/gtm-containers'
import { createClient } from '@/lib/supabase/server'

/**
 * Danh sách container Tag Manager có thể kết nối — chỉ hiện khi Site ĐÃ có
 * connection Google khác VÀ CHƯA có container Tag Manager nào được kết nối.
 * Phần lớn container không khai báo domain trong Google API nên không tự dò
 * được như GA4/Search Console (xem `lib/data/gtm-containers.ts`) — người dùng
 * tự chọn đúng container ở đây.
 */
export async function GtmPicker({ siteId }: { readonly siteId: string }) {
  const supabase = await createClient()
  const { data: existingGtm } = await supabase
    .from('connections')
    .select('id')
    .eq('site_id', siteId)
    .eq('provider', 'gtm')
    .limit(1)

  // Đã có container Tag Manager kết nối rồi (tự dò được domain, hoặc chọn
  // tay từ trước) — không cần hiện lại bộ chọn này nữa.
  if (existingGtm && existingGtm.length > 0) return null

  const result = await listAvailableGtmContainers(siteId)

  // Chưa có kết nối Google nào để mượn token, hoặc token đã hết hạn — chưa
  // đáng hiện gì ở đây, thẻ Google bên trên đã đủ hướng dẫn.
  if (!result.ok) return null

  if (result.containers.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-5">
        <AlertCircle aria-hidden className="size-5 shrink-0 text-[var(--color-caution)]" />
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          Tài khoản Google này chưa có container Tag Manager nào.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Chọn container Tag Manager"
        description="Phần lớn container không khai báo domain nên không tự dò được như GA4/Search Console — chọn đúng container quản lý website này."
      />
      <ul className="flex flex-col divide-y divide-[var(--color-rule)] px-5 pb-4">
        {result.containers.map((container) => (
          <li
            key={container.containerPath}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                {container.name}
              </p>
              <p className="truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                {container.containerPath}
              </p>
            </div>
            <ConnectGtmButton
              siteId={siteId}
              containerPath={container.containerPath}
              name={container.name}
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}
