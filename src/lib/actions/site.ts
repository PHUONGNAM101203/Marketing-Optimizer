'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LAST_SITE_COOKIE } from '@/lib/last-site-cookie'
import { normalizeHostname } from '@/lib/domain/hostname'

/**
 * Tạo Site từ URL người dùng nhập.
 *
 * Đây là điểm vào duy nhất của sản phẩm — website nào gõ vào đây thì thành
 * Site đó, không có gì bị khoá cứng.
 */

const urlSchema = z
  .string()
  .trim()
  .min(1, 'Vui lòng nhập địa chỉ website')
  // Người dùng gõ "shop.vn" chứ hiếm khi gõ "https://shop.vn" — tự thêm
  // giao thức thay vì bắt họ đọc thông báo lỗi.
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .refine((value) => {
    try {
      const parsed = new URL(value)
      return parsed.hostname.includes('.') && parsed.hostname.length > 3
    } catch {
      return false
    }
  }, 'Địa chỉ website không hợp lệ')

const schema = z.object({
  url: urlSchema,
  name: z.string().trim().max(120, 'Tên quá dài').optional(),
})

export interface CreateSiteState {
  readonly error: string | null
}

export async function createSite(
  _previous: CreateSiteState,
  formData: FormData,
): Promise<CreateSiteState> {
  const parsed = schema.safeParse({
    url: formData.get('url'),
    name: formData.get('name') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  const parsedUrl = new URL(parsed.data.url)
  const domain = normalizeHostname(parsedUrl.hostname)

  const { data, error } = await supabase
    .from('sites')
    .insert({
      owner_id: user.id,
      name: parsed.data.name?.trim() || domain,
      url: parsedUrl.origin,
      domain,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = vi phạm unique. Chỉ có một ràng buộc unique trên bảng này, nên
    // suy ra được nguyên nhân mà không phải đọc chuỗi lỗi của Postgres.
    if (error.code === '23505') {
      return { error: `Bạn đã thêm ${domain} rồi.` }
    }
    return { error: `Không tạo được website: ${error.message}` }
  }

  revalidatePath('/', 'layout')
  redirect(`/${data.id}/connections`)
}

const updateSchema = z.object({
  siteId: z.string().uuid('Site không hợp lệ'),
  url: urlSchema,
  name: z.string().trim().min(1, 'Vui lòng nhập tên').max(120, 'Tên quá dài'),
  timezone: z.string().trim().min(1, 'Vui lòng nhập múi giờ').max(64, 'Múi giờ quá dài'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, 'Đơn vị tiền phải có đúng 3 ký tự (vd. VND, USD)'),
  // Rỗng ("Khác — tự chọn bên dưới") nghĩa là không gắn quốc gia cụ thể —
  // ghi `null`, không ép về một mã sai.
  country: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().trim().toLowerCase().max(8).optional(),
  ),
})

export interface UpdateSiteState {
  readonly error: string | null
  readonly success: boolean
}

/**
 * Sửa thông tin Site. Tên miền KHÔNG nhận trực tiếp — luôn tính lại từ URL,
 * giống lúc tạo Site, để domain không bao giờ lệch khỏi URL thật (domain là
 * thứ đối chiếu với property GA4/Search Console lúc kết nối).
 *
 * Không tự kiểm tra role ở đây — policy `sites_update_admin` (migration 001)
 * đã chặn ở tầng RLS. Update khớp 0 dòng vì không đủ quyền thì `.single()`
 * trả lỗi PGRST116, bắt ở dưới để báo đúng lý do thay vì "Không lưu được".
 */
export async function updateSite(
  _previous: UpdateSiteState,
  formData: FormData,
): Promise<UpdateSiteState> {
  const parsed = updateSchema.safeParse({
    siteId: formData.get('siteId'),
    url: formData.get('url'),
    name: formData.get('name'),
    timezone: formData.get('timezone'),
    currency: formData.get('currency'),
    country: formData.get('country'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', success: false }
  }

  const supabase = await createClient()
  const parsedUrl = new URL(parsed.data.url)
  const domain = normalizeHostname(parsedUrl.hostname)

  const { error } = await supabase
    .from('sites')
    .update({
      name: parsed.data.name,
      url: parsedUrl.origin,
      domain,
      timezone: parsed.data.timezone,
      currency: parsed.data.currency,
      country: parsed.data.country ?? null,
    })
    .eq('id', parsed.data.siteId)
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: `Bạn đã có website khác dùng tên miền ${domain} rồi.`, success: false }
    }
    if (error.code === 'PGRST116') {
      return {
        error: 'Chỉ chủ sở hữu hoặc quản trị viên mới sửa được thông tin này.',
        success: false,
      }
    }
    return { error: `Không lưu được thay đổi: ${error.message}`, success: false }
  }

  revalidatePath(`/${parsed.data.siteId}`, 'layout')
  return { error: null, success: true }
}

// Rỗng ("Dùng mặc định") → ghi `null`, quay về mặc định hệ thống thay vì ép
// một con số. Nhập được thì phải trong khoảng có nghĩa (tỉ lệ 1-99%, giờ
// 1-720 ≈ 30 ngày) — ngoài khoảng đó gần như chắc là gõ nhầm đơn vị.
const percentOrDefault = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : Number(value) / 100),
  z.number().min(0.01).max(0.99).optional(),
)

const thresholdsSchema = z.object({
  siteId: z.string().uuid('Site không hợp lệ'),
  dropThresholdPct: percentOrDefault,
  criticalDropThresholdPct: percentOrDefault,
  staleSyncHours: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : Number(value)),
    z.number().int().min(1).max(720).optional(),
  ),
})

export interface UpdateInsightThresholdsState {
  readonly error: string | null
  readonly success: boolean
}

/** Ngưỡng cảnh báo trang Đề xuất — trước đây cố định cứng trong
 * `site-insights.ts` (0.3/0.6/48), giờ mỗi site tự chỉnh được. Cùng khuôn
 * `updateSite`: không tự kiểm role, dựa vào `sites_update_admin` (RLS). */
export async function updateInsightThresholds(
  _previous: UpdateInsightThresholdsState,
  formData: FormData,
): Promise<UpdateInsightThresholdsState> {
  const parsed = thresholdsSchema.safeParse({
    siteId: formData.get('siteId'),
    dropThresholdPct: formData.get('dropThresholdPct'),
    criticalDropThresholdPct: formData.get('criticalDropThresholdPct'),
    staleSyncHours: formData.get('staleSyncHours'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', success: false }
  }
  if (
    parsed.data.dropThresholdPct !== undefined &&
    parsed.data.criticalDropThresholdPct !== undefined &&
    parsed.data.criticalDropThresholdPct <= parsed.data.dropThresholdPct
  ) {
    return {
      error: 'Ngưỡng nghiêm trọng phải cao hơn ngưỡng cảnh báo thường.',
      success: false,
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('sites')
    .update({
      insight_drop_threshold_pct: parsed.data.dropThresholdPct ?? null,
      insight_critical_drop_threshold_pct: parsed.data.criticalDropThresholdPct ?? null,
      insight_stale_sync_hours: parsed.data.staleSyncHours ?? null,
    })
    .eq('id', parsed.data.siteId)
    .select('id')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return {
        error: 'Chỉ chủ sở hữu hoặc quản trị viên mới sửa được ngưỡng cảnh báo.',
        success: false,
      }
    }
    return { error: `Không lưu được thay đổi: ${error.message}`, success: false }
  }

  revalidatePath(`/${parsed.data.siteId}/insights`)
  return { error: null, success: true }
}

/**
 * Xoá website — ĐÁNH DẤU, không xoá thật.
 *
 * `sites` là gốc của cây xoá lan: một lệnh `delete` ở đây cuốn theo
 * `connections`, rồi từ đó cuốn tiếp mọi `metrics_daily`,
 * `video_metrics_daily`, `content_metrics_daily`, `connection_secrets`. Tức
 * mất nhiều hơn hẳn sự cố 7/9/2026 (một kết nối TikTok, 1.877 hàng lịch sử,
 * phải khôi phục cả database hai lượt mới lấy lại). Và từ nay project nằm ở
 * gói Free — không còn sao lưu hằng ngày để mà khôi phục.
 *
 * Nên ở đây chỉ đặt `deleted_at`, rồi đánh dấu mọi connection CÒN SỐNG của
 * site bằng ĐÚNG mốc thời gian đó. Dùng chung một mốc là có chủ đích: lúc
 * khôi phục, nó phân biệt được connection "bị site kéo theo" với connection
 * người dùng đã tự gỡ từ trước — chỉ nhóm thứ nhất được hồi sinh.
 *
 * Chỉ CHỦ SỞ HỮU được xoá, không phải admin: admin sửa được nội dung site,
 * nhưng huỷ cả website cùng toàn bộ lịch sử là quyết định của người sở hữu.
 */
export interface DeleteSiteState {
  readonly error: string | null
}

export async function deleteSiteAction(
  _previous: DeleteSiteState,
  formData: FormData,
): Promise<DeleteSiteState> {
  const siteId = formData.get('siteId')
  if (typeof siteId !== 'string' || !siteId) return { error: 'Thiếu website.' }

  const supabase = await createClient()
  const { data: isOwner } = await supabase.rpc('has_site_role', {
    target_site: siteId,
    allowed: ['owner'],
  })
  if (!isOwner) return { error: 'Chỉ chủ sở hữu mới xoá được website.' }

  const admin = createAdminClient()
  const deletedAt = new Date().toISOString()

  const { error } = await admin.from('sites').update({ deleted_at: deletedAt }).eq('id', siteId)
  if (error) return { error: 'Không xoá được website. Vui lòng thử lại.' }

  // Đánh dấu connection SAU khi site đã đánh dấu thành công. Ngược lại, lỗi ở
  // bước trên sẽ để lại một site còn sống nhưng mọi kết nối đã bị gỡ.
  await admin
    .from('connections')
    .update({ disconnected_at: deletedAt })
    .eq('site_id', siteId)
    .is('disconnected_at', null)

  // Người dùng đang đứng trong chính site vừa xoá. Không dọn hai thứ dưới đây
  // thì lần vào app kế tiếp bị đẩy thẳng về site đã xoá rồi nhận 404 — đúng
  // vòng lặp đã sửa ở `last-site-cookie.ts`.
  const { data: user } = await supabase.auth.getUser()
  if (user.user) {
    await admin
      .from('profiles')
      .update({ last_site_id: null })
      .eq('id', user.user.id)
      .eq('last_site_id', siteId)
  }
  const cookieStore = await cookies()
  cookieStore.delete(LAST_SITE_COOKIE)

  revalidatePath('/', 'layout')
  // `/` tự chọn site còn lại, hoặc đưa về onboarding khi đã hết site.
  redirect('/')
}

export interface RestoreSiteState {
  readonly error: string | null
}

/**
 * Bỏ dấu đã-xoá, đưa website trở lại cùng toàn bộ dữ liệu.
 *
 * Không phục dựng gì — chưa hàng nào bị xoá, nên mọi số liệu vẫn gắn đúng
 * `site_id` cũ. Đây chính là điều cách xoá thật không cho phép.
 */
export async function restoreSiteAction(
  _previous: RestoreSiteState,
  formData: FormData,
): Promise<RestoreSiteState> {
  const siteId = formData.get('siteId')
  if (typeof siteId !== 'string' || !siteId) return { error: 'Thiếu website.' }

  const supabase = await createClient()
  const { data: isOwner } = await supabase.rpc('has_site_role', {
    target_site: siteId,
    allowed: ['owner'],
  })
  if (!isOwner) return { error: 'Chỉ chủ sở hữu mới khôi phục được website.' }

  const admin = createAdminClient()
  const { data: site } = await admin
    .from('sites')
    .select('deleted_at')
    .eq('id', siteId)
    .maybeSingle()

  if (!site?.deleted_at) return { error: 'Không tìm thấy website đã xoá.' }

  const { error } = await admin.from('sites').update({ deleted_at: null }).eq('id', siteId)
  if (error) return { error: 'Không khôi phục được website. Vui lòng thử lại.' }

  // CHỈ những connection bị chính lượt xoá site này kéo theo — khớp đúng mốc
  // thời gian. Connection người dùng đã tự gỡ trước đó mang mốc khác và phải
  // ở nguyên trạng thái đã gỡ.
  await admin
    .from('connections')
    .update({ disconnected_at: null })
    .eq('site_id', siteId)
    .eq('disconnected_at', site.deleted_at)

  revalidatePath('/', 'layout')
  return { error: null }
}
