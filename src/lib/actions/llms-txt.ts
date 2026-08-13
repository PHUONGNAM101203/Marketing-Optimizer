'use server'

import { revalidatePath } from 'next/cache'
import { getSite } from '@/lib/data/sites'
import { crawlSite } from '@/lib/audit/crawler'
import { generateLlmsTxtContent } from '@/lib/audit/llms-txt'
import { createClient } from '@/lib/supabase/server'

export interface GenerateLlmsTxtState {
  readonly error: string | null
  readonly ok: boolean
}

const INITIAL_STATE: GenerateLlmsTxtState = { error: null, ok: false }

/**
 * Quét site rồi sinh `llms.txt`, lưu vào `sites.llms_txt_content` — ghi qua
 * client PHIÊN NGƯỜI DÙNG (không phải admin) vì `sites_update_admin` đã đủ
 * chặt (owner/admin), không có gì nhạy cảm ở đây cần vòng qua RLS.
 */
export async function generateLlmsTxtAction(
  _previous: GenerateLlmsTxtState,
  formData: FormData,
): Promise<GenerateLlmsTxtState> {
  const siteId = formData.get('siteId')
  if (typeof siteId !== 'string' || !siteId) {
    return { ...INITIAL_STATE, error: 'Thiếu website.' }
  }

  const site = await getSite(siteId)
  if (!site) return { ...INITIAL_STATE, error: 'Không tìm thấy website hoặc bạn không có quyền.' }

  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: siteId,
    allowed: ['owner', 'admin'],
  })
  if (!isAdmin) {
    return { ...INITIAL_STATE, error: 'Chỉ chủ sở hữu hoặc quản trị viên mới sinh được llms.txt.' }
  }

  const crawl = await crawlSite(site.url)
  if (crawl.pages.length === 0) {
    return { ...INITIAL_STATE, error: 'Không quét được trang nào — kiểm tra domain có truy cập được không.' }
  }

  const content = generateLlmsTxtContent(site, crawl)
  const { error } = await supabase
    .from('sites')
    .update({ llms_txt_content: content, llms_txt_generated_at: new Date().toISOString() })
    .eq('id', siteId)

  if (error) return { ...INITIAL_STATE, error: `Không lưu được: ${error.message}` }

  revalidatePath(`/${siteId}/ai-visibility`)
  return { ok: true, error: null }
}
