import { notFound, redirect } from 'next/navigation'
import { after } from 'next/server'
import type { ReactNode } from 'react'
import { SideRail } from '@/components/layout/side-rail'
import { Topbar } from '@/components/layout/topbar'
import { getCurrentProfile, getSite, listSites, setLastSiteId } from '@/lib/data/sites'
import { getConnectionSummary } from '@/lib/data/connections'

/**
 * Shell của khu vực ứng dụng.
 *
 * Site và người dùng đã lấy từ Supabase thật. Số liệu vẫn là dữ liệu mẫu —
 * bảng `connections` và `metrics_daily` thuộc M3. Ranh giới này rõ ràng: mọi
 * thứ dưới `lib/data/` là thật, mọi thứ dưới `mock/` sẽ bị xoá.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  readonly children: ReactNode
  readonly params: Promise<{ readonly siteId: string }>
}) {
  const { siteId } = await params

  const [site, sites, profile, connections] = await Promise.all([
    getSite(siteId),
    listSites(),
    getCurrentProfile(),
    getConnectionSummary(siteId),
  ])

  if (!profile) redirect('/sign-in')
  // RLS đã lọc: không đọc được nghĩa là hoặc không tồn tại, hoặc không có
  // quyền. Cả hai đều trả 404 — trả 403 sẽ tiết lộ Site đó có tồn tại.
  if (!site) notFound()

  // Chỉ ghi khi site thực sự đổi so với lần trước — tránh ghi lại mỗi lần
  // chuyển trang/tab trong cùng một site. after() chạy sau khi response đã
  // trả về nên không thêm độ trễ cho việc render.
  if (profile.lastSiteId !== site.id) {
    after(() => setLastSiteId(profile.userId, site.id))
  }

  return (
    <div className="flex min-h-dvh">
      <SideRail
        siteId={site.id}
        siteName={site.name}
        siteDomain={site.domain}
        userName={profile.displayName}
        userEmail={profile.email}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          site={site}
          sites={sites}
          lastSyncedAt={connections.lastSyncedAt}
          hasConnections={!connections.isEmpty}
          // Giờ đồng bộ là dữ liệu THẬT (connections.lastSyncedAt từ Supabase) —
          // phải so với giờ THẬT, không phải ngày neo của dữ liệu mock.
          now={new Date()}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
