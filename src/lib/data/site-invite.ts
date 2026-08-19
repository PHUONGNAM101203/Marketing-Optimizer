import 'server-only'

import type { SiteRole } from '@/lib/domain/site'
import { createClient } from '@/lib/supabase/server'

export interface SiteInviteLink {
  readonly token: string
  readonly role: SiteRole
  readonly createdAt: string
}

/** `null` khi site chưa từng tạo link mời — trang Cài đặt tự hiện nút "Tạo
 * link mời" thay vì link, không coi đây là lỗi. RLS (`site_invite_links_select_admin`)
 * đã lo việc chỉ owner/admin đọc được — không tự kiểm role ở đây. */
export const getInviteLink = async (siteId: string): Promise<SiteInviteLink | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('site_invite_links')
    .select('token, role, created_at')
    .eq('site_id', siteId)
    .maybeSingle()

  return data ? { token: data.token, role: data.role as SiteRole, createdAt: data.created_at } : null
}
