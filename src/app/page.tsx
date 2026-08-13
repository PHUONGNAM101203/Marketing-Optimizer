import { redirect } from 'next/navigation'
import { listSites } from '@/lib/data/sites'
import { getCurrentUser } from '@/lib/supabase/server'

/**
 * Điểm vào. Ba nhánh:
 *   chưa đăng nhập      → /sign-in
 *   đăng nhập, chưa Site → /onboarding
 *   đăng nhập, có Site   → Site đầu tiên
 *
 * Proxy cũng chặn trường hợp chưa đăng nhập, nhưng kiểm tra lại ở đây là
 * cố ý: proxy là lớp tiện lợi, không phải lớp bảo mật — một cấu hình
 * matcher sai là nó im lặng ngừng chạy.
 */
export default async function RootPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const sites = await listSites()
  if (sites.length === 0) redirect('/onboarding')

  redirect(`/${sites[0]!.id}/overview`)
}
