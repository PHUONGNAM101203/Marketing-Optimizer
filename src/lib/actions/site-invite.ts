'use server'

import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SiteRole } from '@/lib/domain/site'

/**
 * Link mời — xem migration `20260819000003_site_invite_links.sql` cho lý do
 * chọn "một link cố định/site" thay vì gửi email từng người.
 */

const siteIdSchema = z.string().uuid()

export interface InviteLinkActionState {
  readonly error: string | null
  readonly token: string | null
}

/** Tạo link mời nếu site chưa có (`role` mặc định `viewer`) — không tự đổi
 * token nếu đã tồn tại, xem `regenerateInviteLink` cho việc đó. */
export async function ensureInviteLink(siteId: string): Promise<InviteLinkActionState> {
  const parsedSiteId = siteIdSchema.safeParse(siteId)
  if (!parsedSiteId.success) return { error: 'Site không hợp lệ', token: null }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập', token: null }

  const { data: existing } = await supabase
    .from('site_invite_links')
    .select('token')
    .eq('site_id', parsedSiteId.data)
    .maybeSingle()
  if (existing) return { error: null, token: existing.token }

  const token = randomUUID().replace(/-/g, '')
  const { error } = await supabase
    .from('site_invite_links')
    .insert({ site_id: parsedSiteId.data, token, created_by: user.id })

  if (error) {
    if (error.code === '42501' || error.code === 'PGRST116') {
      return { error: 'Chỉ chủ sở hữu hoặc quản trị viên mới tạo được link mời.', token: null }
    }
    return { error: `Không tạo được link mời: ${error.message}`, token: null }
  }

  revalidatePath(`/${parsedSiteId.data}/settings`)
  return { error: null, token }
}

/** Đổi sang token mới — vô hiệu link cũ ngay lập tức (ai còn giữ link cũ sẽ
 * không vào được nữa). */
export async function regenerateInviteLink(siteId: string): Promise<InviteLinkActionState> {
  const parsedSiteId = siteIdSchema.safeParse(siteId)
  if (!parsedSiteId.success) return { error: 'Site không hợp lệ', token: null }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập', token: null }

  const token = randomUUID().replace(/-/g, '')
  const { error } = await supabase
    .from('site_invite_links')
    .upsert({ site_id: parsedSiteId.data, token, created_by: user.id }, { onConflict: 'site_id' })

  if (error) {
    if (error.code === '42501' || error.code === 'PGRST116') {
      return { error: 'Chỉ chủ sở hữu hoặc quản trị viên mới tạo lại được link mời.', token: null }
    }
    return { error: `Không tạo lại được link mời: ${error.message}`, token: null }
  }

  revalidatePath(`/${parsedSiteId.data}/settings`)
  return { error: null, token }
}

const setRoleSchema = z.object({
  siteId: z.string().uuid(),
  role: z.enum(['admin', 'viewer']),
})

/** Vai trò link mời cấp cho người dùng — cố tình KHÔNG cho chọn `owner` (một
 * site chỉ có một chủ sở hữu, gán qua link mời sẽ phá bất biến đó). */
export async function setInviteLinkRole(input: {
  readonly siteId: string
  readonly role: 'admin' | 'viewer'
}): Promise<{ readonly error: string | null }> {
  const parsed = setRoleSchema.safeParse(input)
  if (!parsed.success) return { error: 'Dữ liệu không hợp lệ' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('site_invite_links')
    .update({ role: parsed.data.role })
    .eq('site_id', parsed.data.siteId)

  if (error) return { error: `Không lưu được: ${error.message}` }

  revalidatePath(`/${parsed.data.siteId}/settings`)
  return { error: null }
}

export interface InvitePreview {
  readonly siteId: string
  readonly siteName: string
  readonly siteDomain: string
  readonly role: SiteRole
  readonly alreadyMember: boolean
}

/** Tra token — dùng `createAdminClient()` vì người bấm link CHƯA phải site
 * member (đó chính là lý do họ cần link này), nên RLS thường (yêu cầu đã là
 * thành viên) sẽ luôn chặn chính lượt tra cứu đầu tiên này. Đây là một trong
 * số ít trường hợp hợp lệ được ghi rõ ở `admin.ts`: bootstrap-insert mà RLS
 * không thể tự diễn tả được. Chỉ ĐỌC ở bước này — chưa ghi `site_members`,
 * xem `acceptInvite` cho bước đó (tách riêng để trang có thể hiện xác nhận
 * trước khi thật sự tham gia, tránh join nhầm vì lỡ bấm link). */
export async function previewInvite(token: string): Promise<InvitePreview | { readonly error: string }> {
  const parsedToken = z.string().min(1).safeParse(token)
  if (!parsedToken.success) return { error: 'Link mời không hợp lệ' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập' }

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('site_invite_links')
    .select('site_id, role, sites(name, domain)')
    .eq('token', parsedToken.data)
    .maybeSingle()
  if (!invite) return { error: 'Link mời không tồn tại hoặc đã bị thu hồi.' }

  const { data: existingMember } = await admin
    .from('site_members')
    .select('user_id')
    .eq('site_id', invite.site_id)
    .eq('user_id', user.id)
    .maybeSingle()

  const site = invite.sites as unknown as { readonly name: string; readonly domain: string } | null

  return {
    siteId: invite.site_id,
    siteName: site?.name ?? invite.site_id,
    siteDomain: site?.domain ?? '',
    role: invite.role as SiteRole,
    alreadyMember: Boolean(existingMember),
  }
}

/** Bước ghi thật — tách khỏi `previewInvite` để trang xác nhận trước khi
 * join, không tự động thêm thành viên chỉ vì ai đó mở link (vd. link bị dán
 * nhầm vào một kênh công khai). */
export async function acceptInvite(token: string): Promise<void> {
  const parsedToken = z.string().min(1).safeParse(token)
  if (!parsedToken.success) redirect('/')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`)

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('site_invite_links')
    .select('site_id, role')
    .eq('token', parsedToken.data)
    .maybeSingle()
  if (!invite) redirect('/')

  // `upsert` chứ không `insert` — bấm lại link mời khi đã là thành viên chỉ
  // nên đưa họ vào site, không nên ném lỗi vi phạm khoá chính (site_id,
  // user_id) đã có sẵn.
  await admin
    .from('site_members')
    .upsert({ site_id: invite.site_id, user_id: user.id, role: invite.role }, { onConflict: 'site_id,user_id' })

  redirect(`/${invite.site_id}/overview`)
}
