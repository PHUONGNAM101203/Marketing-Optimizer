import 'server-only'

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'
import type { Site, SiteMember, SiteRole } from '@/lib/domain/site'

/**
 * Truy vấn Site phía server.
 *
 * Không có lệnh `where user_id = ...` nào ở đây — RLS đã lọc rồi. Lọc thêm ở
 * tầng ứng dụng chỉ tạo cảm giác an toàn giả: nếu RLS sai thì bộ lọc này cũng
 * không cứu được, còn nếu RLS đúng thì nó thừa.
 */

interface SiteRow {
  readonly id: string
  readonly owner_id: string
  readonly name: string
  readonly url: string
  readonly domain: string
  readonly timezone: string
  readonly currency: string
  readonly country: string | null
  readonly created_at: string
  readonly llms_txt_content: string | null
  readonly llms_txt_generated_at: string | null
  readonly insight_drop_threshold_pct: number | null
  readonly insight_critical_drop_threshold_pct: number | null
  readonly insight_stale_sync_hours: number | null
}

const toSite = (row: SiteRow): Site => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  url: row.url,
  domain: row.domain,
  timezone: row.timezone,
  currency: row.currency,
  country: row.country,
  createdAt: row.created_at,
  llmsTxtContent: row.llms_txt_content,
  llmsTxtGeneratedAt: row.llms_txt_generated_at,
  insightDropThresholdPct: row.insight_drop_threshold_pct,
  insightCriticalDropThresholdPct: row.insight_critical_drop_threshold_pct,
  insightStaleSyncHours: row.insight_stale_sync_hours,
})

export const listSites = async (): Promise<readonly Site[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Không đọc được danh sách website: ${error.message}`)
  return (data ?? []).map(toSite)
}

/**
 * Bọc `cache()` — layout.tsx và page.tsx của cùng một request đều tự gọi lại
 * hàm này (page không nhận Site qua prop vì layout không truyền context được
 * xuống cho page song song trong App Router). `cache()` gộp các lệnh gọi
 * trùng `siteId` trong CÙNG một lượt render server thành một round-trip
 * Supabase duy nhất thay vì hai.
 */
export const getSite = cache(async (siteId: string): Promise<Site | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('id', siteId)
    .maybeSingle()

  // RLS trả về rỗng khi không có quyền, không trả về lỗi — nên "không tìm thấy"
  // và "không được phép" là cùng một kết quả ở đây. Đó là chủ ý: phân biệt hai
  // trường hợp sẽ để lộ việc một Site có tồn tại hay không.
  if (error) throw new Error(`Không đọc được website: ${error.message}`)
  return data ? toSite(data as SiteRow) : null
})

/**
 * Thành viên của một Site, kèm tên hiển thị.
 *
 * Hai truy vấn thay vì một phép join lồng: `site_members.user_id` tham chiếu
 * `auth.users`, không tham chiếu `profiles`, nên PostgREST không suy ra được
 * quan hệ và cú pháp `profiles(...)` sẽ lỗi lúc chạy. Có thể thêm khoá ngoại
 * sang `profiles` để join được, nhưng đổi schema chỉ để tiết kiệm một lượt
 * truy vấn trên một danh sách vài dòng là cái giá sai.
 */
export const listMembers = async (siteId: string): Promise<readonly SiteMember[]> => {
  const supabase = await createClient()

  const { data: members, error } = await supabase
    .from('site_members')
    .select('user_id, role, created_at')
    .eq('site_id', siteId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Không đọc được thành viên: ${error.message}`)
  if (!members || members.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in(
      'id',
      members.map((member) => member.user_id),
    )

  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]))

  return members.map((member) => ({
    siteId,
    userId: member.user_id,
    role: member.role as SiteRole,
    displayName: byId.get(member.user_id)?.full_name ?? 'Chưa đặt tên',
    // Email nằm ở auth.users, khoá anon không đọc được. Muốn hiện email thì
    // phải thêm cột vào profiles — để sang M3 cùng lúc với phần mời thành viên.
    email: '',
    avatarUrl: byId.get(member.user_id)?.avatar_url ?? null,
    joinedAt: member.created_at,
  }))
}

export const getCurrentProfile = async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, last_site_id')
    .eq('id', user.id)
    .maybeSingle()

  return {
    userId: user.id,
    email: user.email ?? '',
    displayName: data?.full_name ?? user.email?.split('@')[0] ?? 'Bạn',
    avatarUrl: data?.avatar_url ?? null,
    lastSiteId: data?.last_site_id ?? null,
  }
}

/**
 * Ghi lại site đang xem, theo tài khoản. Gọi từ `after()` trong layout của
 * site — không được throw ra ngoài request đang render, nên tự nuốt lỗi ở
 * đây và chỉ log.
 *
 * Nhận `supabase` làm tham số thay vì tự `createClient()`: client đó đọc
 * cookie qua `next/headers`, một Request-time API — gọi được trong Server
 * Component lúc render, nhưng gọi bên trong callback của `after()` thì Next
 * ném lỗi runtime (after chạy sau khi vòng đời render đã kết thúc). Nơi gọi
 * phải tự tạo client lúc render rồi truyền vào đây qua closure.
 */
export const setLastSiteId = async (
  supabase: SupabaseClient<Database>,
  userId: string,
  siteId: string,
): Promise<void> => {
  const { error } = await supabase
    .from('profiles')
    .update({ last_site_id: siteId })
    .eq('id', userId)

  if (error) console.error(`Không ghi được last_site_id: ${error.message}`)
}
