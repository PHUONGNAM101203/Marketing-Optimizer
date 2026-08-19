'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Bỏ qua / đưa vào hàng chờ duyệt một đề xuất.
 *
 * "Đưa vào hàng chờ duyệt" ở đây là gắn cờ `acknowledged` để người dùng tự
 * theo dõi — KHÔNG phải hàng đợi thực thi hành động ghi ra nền tảng ngoài
 * (đổi ngân sách, tạm dừng chiến dịch…). Hạ tầng đó (agent + cổng duyệt)
 * chưa tồn tại; gắn nhãn quá tay ở đây sẽ khiến người dùng tưởng nhầm hành
 * động đã được lên lịch chạy thật.
 *
 * Không tự kiểm tra quyền thành viên ở đây — policy `insight_actions_*_member`
 * (migration `20260819000002_insight_settings.sql`) đã chặn ở tầng RLS,
 * giống `updateSite` không tự kiểm role vì `sites_update_admin` đã lo.
 */

const setActionSchema = z.object({
  siteId: z.string().uuid(),
  insightId: z.string().min(1).max(200),
  action: z.enum(['dismissed', 'acknowledged']),
})

export async function setInsightAction(input: {
  readonly siteId: string
  readonly insightId: string
  readonly action: 'dismissed' | 'acknowledged'
}): Promise<{ readonly error: string | null }> {
  const parsed = setActionSchema.safeParse(input)
  if (!parsed.success) return { error: 'Dữ liệu không hợp lệ' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập' }

  const { error } = await supabase.from('insight_actions').upsert(
    {
      site_id: parsed.data.siteId,
      insight_id: parsed.data.insightId,
      action: parsed.data.action,
      created_by: user.id,
    },
    { onConflict: 'site_id,insight_id' },
  )

  if (error) return { error: `Không lưu được: ${error.message}` }

  revalidatePath(`/${parsed.data.siteId}/insights`)
  return { error: null }
}

const clearActionSchema = z.object({
  siteId: z.string().uuid(),
  insightId: z.string().min(1).max(200),
})

/** "Khôi phục" — bỏ trạng thái đã gán, insight quay lại hiện bình thường. */
export async function clearInsightAction(input: {
  readonly siteId: string
  readonly insightId: string
}): Promise<{ readonly error: string | null }> {
  const parsed = clearActionSchema.safeParse(input)
  if (!parsed.success) return { error: 'Dữ liệu không hợp lệ' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('insight_actions')
    .delete()
    .eq('site_id', parsed.data.siteId)
    .eq('insight_id', parsed.data.insightId)

  if (error) return { error: `Không khôi phục được: ${error.message}` }

  revalidatePath(`/${parsed.data.siteId}/insights`)
  return { error: null }
}
