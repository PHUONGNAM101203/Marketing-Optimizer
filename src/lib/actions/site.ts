'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
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
