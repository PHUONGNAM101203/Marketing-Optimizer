import { redirect } from 'next/navigation'
import { getCurrentProfile, listSites } from '@/lib/data/sites'
import { getCurrentUser } from '@/lib/supabase/server'

/**
 * Điểm vào. Ba nhánh:
 *   chưa đăng nhập      → /sign-in
 *   đăng nhập, chưa Site → /onboarding
 *   đăng nhập, có Site   → Site đã xem gần nhất, hoặc Site đầu tiên nếu
 *                          chưa từng chọn / Site đã lưu không còn truy cập
 *                          được (đã xoá, hoặc bị gỡ quyền — listSites() đã
 *                          lọc theo RLS nên "không có trong danh sách" phủ
 *                          cả hai trường hợp)
 *
 * Proxy cũng chặn trường hợp chưa đăng nhập, nhưng kiểm tra lại ở đây là
 * cố ý: proxy là lớp tiện lợi, không phải lớp bảo mật — một cấu hình
 * matcher sai là nó im lặng ngừng chạy.
 */
export default async function RootPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const [sites, profile] = await Promise.all([listSites(), getCurrentProfile()])
  if (sites.length === 0) redirect('/onboarding')

  const targetSiteId =
    profile?.lastSiteId && sites.some((site) => site.id === profile.lastSiteId)
      ? profile.lastSiteId
      : sites[0]!.id

  redirect(`/${targetSiteId}/overview`)
}
