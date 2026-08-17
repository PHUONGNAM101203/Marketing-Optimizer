'use server'

import { revalidatePath } from 'next/cache'
import { callAi, extractText, type AiProvider } from '@/lib/providers/ai'
import { resolveAiConfig } from '@/lib/data/site-ai-keys'
import { getSite } from '@/lib/data/sites'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { AiEngine } from '@/lib/domain/geo'

const ENGINE_OF_PROVIDER: Readonly<Record<AiProvider, AiEngine>> = {
  anthropic: 'claude',
  openai: 'chatgpt',
  gemini: 'gemini',
}

const CITATION_SYSTEM_PROMPT =
  'Bạn là trợ lý AI trả lời câu hỏi cho người dùng thật — trả lời tự nhiên, hữu ích, dùng công cụ tìm kiếm web khi cần để có thông tin chính xác và cập nhật, giống hệt cách bạn trả lời một người dùng bình thường hỏi trực tiếp.'

/** Bỏ `www.`/protocol để so khớp domain thô — `SiteProfile`/`site.domain` đã
 * lưu domain trần (không protocol), nhưng URL người dùng lỡ nhập lúc kết nối
 * có thể có tiền tố `www.` không nhất quán với domain xuất hiện trong câu
 * trả lời của AI. */
const normalizeDomain = (domain: string): string => domain.replace(/^www\./i, '').toLowerCase()

const findExcerpt = (text: string, needle: string): string | null => {
  const index = text.toLowerCase().indexOf(needle.toLowerCase())
  if (index === -1) return null
  const start = Math.max(0, index - 80)
  const end = Math.min(text.length, index + needle.length + 80)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end).trim()}${suffix}`
}

const findCitedUrl = (text: string, domain: string): string | null => {
  const urlPattern = /https?:\/\/[^\s)"'<>]+/gi
  const matches = text.match(urlPattern) ?? []
  return matches.find((url) => url.toLowerCase().includes(domain)) ?? null
}

export interface CitationCheckState {
  readonly error: string | null
  readonly cited: boolean | null
}

const INITIAL_STATE: CitationCheckState = { error: null, cited: null }

/**
 * Hỏi THẬT engine site đang cấu hình (`resolveAiConfig`) đúng câu hỏi đang
 * theo dõi, bật web search gốc của hãng (mô phỏng sát hành vi ChatGPT/
 * Perplexity thật hơn chỉ dựa kiến thức huấn luyện — xem
 * docs/superpowers/specs/2026-08-17-ai-citation-check-design.md), rồi đọc
 * câu trả lời có nhắc domain/tên site không. Chỉ owner/admin được chạy —
 * đây là lượt gọi API thật, tốn phí thật của site, cùng mức quyền
 * `runSiteAuditAction` đòi hỏi.
 */
export async function runCitationCheckAction(
  _previous: CitationCheckState,
  formData: FormData,
): Promise<CitationCheckState> {
  const siteId = formData.get('siteId')
  const promptId = formData.get('promptId')
  const promptText = formData.get('promptText')
  if (typeof siteId !== 'string' || typeof promptId !== 'string' || typeof promptText !== 'string') {
    return { ...INITIAL_STATE, error: 'Thiếu dữ liệu câu hỏi.' }
  }

  const user = await getCurrentUser()
  if (!user) return { ...INITIAL_STATE, error: 'Phiên đăng nhập đã hết hạn.' }

  const site = await getSite(siteId)
  if (!site) return { ...INITIAL_STATE, error: 'Không tìm thấy website hoặc bạn không có quyền.' }

  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: siteId,
    allowed: ['owner', 'admin'],
  })
  if (!isAdmin) {
    return { ...INITIAL_STATE, error: 'Chỉ chủ sở hữu hoặc quản trị viên mới kiểm tra được.' }
  }

  const aiConfig = await resolveAiConfig(siteId)
  if (!aiConfig) {
    return { ...INITIAL_STATE, error: 'Chưa cấu hình API key AI cho website này. Vào Cài đặt để thêm.' }
  }

  let responseText: string
  try {
    const result = await callAi({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      systemPrompt: CITATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text: promptText }] }],
      enableWebSearch: true,
    })
    responseText = extractText(result)
  } catch (error) {
    return {
      ...INITIAL_STATE,
      error: `Gọi ${aiConfig.provider} thất bại: ${error instanceof Error ? error.message : 'Lỗi không xác định'}`,
    }
  }

  const domain = normalizeDomain(site.domain)
  const citedByDomain = responseText.toLowerCase().includes(domain)
  const citedByName = responseText.toLowerCase().includes(site.name.toLowerCase())
  const cited = citedByDomain || citedByName
  const excerpt = cited ? (findExcerpt(responseText, domain) ?? findExcerpt(responseText, site.name)) : null

  const admin = createAdminClient()
  const { error: insertError } = await admin.from('citation_checks').insert({
    prompt_id: promptId,
    engine: ENGINE_OF_PROVIDER[aiConfig.provider],
    cited,
    excerpt,
    cited_url: cited ? findCitedUrl(responseText, domain) : null,
  })
  if (insertError) return { ...INITIAL_STATE, error: `Không lưu được kết quả: ${insertError.message}` }

  revalidatePath(`/${siteId}/ai-visibility`)
  return { error: null, cited }
}
