import { notFound, redirect } from 'next/navigation'
import { after } from 'next/server'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { SideRail } from '@/components/layout/side-rail'
import { Topbar } from '@/components/layout/topbar'
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer'
import { ConnectionsRealtime } from '@/components/realtime/connections-realtime'
import { MobileNavProvider } from '@/components/layout/mobile-nav-context'
import { getCurrentProfile, getSite, listSites, setLastSiteId } from '@/lib/data/sites'
import { getConnectionSummary } from '@/lib/data/connections'
import { isAwaitingFirstSync } from '@/lib/domain/connection'
import { createClient } from '@/lib/supabase/server'
import { LAST_SITE_COOKIE, LAST_SITE_COOKIE_MAX_AGE } from '@/lib/last-site-cookie'

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
  //
  // Client Supabase phải tạo Ở ĐÂY, lúc render (đọc cookie ngay bây giờ) rồi
  // truyền vào qua closure — KHÔNG được tự tạo bên trong callback của
  // after(): after() chạy sau vòng đời render, gọi cookies() lúc đó bị Next
  // ném lỗi runtime (xem node_modules/next/dist/docs/.../after.md).
  if (profile.lastSiteId !== site.id) {
    const supabase = await createClient()
    after(() => setLastSiteId(supabase, profile.userId, site.id))
  }

  // Cùng thông tin, nhưng ghi thêm vào cookie để `proxy.ts` đọc được NGAY TẠI
  // EDGE và chuyển hướng `/` mà không phải gọi hàm server rồi mới biết đích —
  // xem `lib/last-site-cookie.ts`. Ghi mỗi lượt render (không gói trong điều
  // kiện ở trên) vì cookie có thể hết hạn hoặc bị xoá độc lập với hàng trong
  // `profiles`; ghi lại là thao tác rẻ và giữ hai nguồn không lệch nhau.
  ;(await cookies()).set(LAST_SITE_COOKIE, site.id, {
    maxAge: LAST_SITE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    path: '/',
  })

  return (
    // `h-dvh overflow-hidden` (không phải `min-h-dvh` cũ) — bắt buộc để
    // `<main>` bên dưới là vùng cuộn ĐỘC LẬP thay vì cả trang cuộn chung một
    // `window`. Trước đây sidebar (`sticky top-0`, `side-rail.tsx`) bám theo
    // chiều cao của CHÍNH container này — container này lại co giãn theo nội
    // dung `<main>` (không giới hạn). Bất kỳ tương tác nào làm nội dung
    // `<main>` NGẮN LẠI đột ngột trong khi đang cuộn sâu (đổi tab `UrlTabs`,
    // đổi khoảng ngày, đổi kênh — tất cả đều cố tình `scroll: false`/tự
    // `pushState` để tránh giật trang) khiến trình duyệt tự kẹp `scrollY` về
    // mức cao nhất mới, kéo luôn "cửa sổ dính" của sidebar theo — sidebar
    // trông như chỉ còn hiện phần cuối (mấy mục Kết nối/Cài đặt) và avatar
    // trôi giữa trang. Cố định chiều cao container ở viewport rồi cho
    // `<main>` tự cuộn riêng loại bỏ hẳn cơ chế lỗi này, bất kể control nào
    // gây co ngót nội dung.
    <MobileNavProvider>
      {/* Chỉ nghe Realtime khi có kết nối ĐANG chạy lượt đồng bộ đầu tiên —
          xem `isAwaitingFirstSync` để biết vì sao không dùng
          `status === 'syncing'`, và xem component để biết vì sao không bật
          thường trực. */}
      <ConnectionsRealtime
        siteId={site.id}
        waiting={connections.all.some((connection) =>
          isAwaitingFirstSync(connection, new Date()),
        )}
      />
      <div className="flex h-dvh overflow-hidden">
        <SideRail
          siteId={site.id}
          siteName={site.name}
          siteDomain={site.domain}
          userName={profile.displayName}
          userEmail={profile.email}
        />
        <MobileNavDrawer
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
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  )
}
