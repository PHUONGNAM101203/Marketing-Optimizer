import 'server-only'

import { decrypt } from '@/lib/crypto'
import { DEFAULT_CLAUDE_MODEL } from '@/lib/providers/anthropic'
import type { AiProvider } from '@/lib/providers/ai'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Claude API Key do từng Site tự khai báo — đọc từ két `site_ai_keys`.
 *
 * Bảng đó cố tình không có RLS policy nào (xem migration
 * 20260817000001_site_ai_keys.sql), giống hệt `site_oauth_apps`/
 * `connection_secrets`. Đọc ở đây LUÔN qua `service_role`, và LUÔN sau khi
 * nơi gọi đã tự xác minh quyền — bảng này không tự bảo vệ được bằng RLS.
 */

export const getSiteAnthropicApiKey = async (siteId: string): Promise<string | null> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_ai_keys')
    .select('api_key_enc')
    .eq('site_id', siteId)
    .eq('provider', 'anthropic')
    .maybeSingle()

  if (!data) return null
  return decrypt(data.api_key_enc)
}

/** Chỉ kiểm tra tồn tại, không giải mã — dùng cho trạng thái hiển thị UI
 * (đã cấu hình hay chưa), giống `siteOAuthAppExists`. */
export const siteAnthropicApiKeyConfigured = async (siteId: string): Promise<boolean> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_ai_keys')
    .select('site_id')
    .eq('site_id', siteId)
    .eq('provider', 'anthropic')
    .maybeSingle()

  return data !== null
}

/**
 * Hàm mà `testRunPromptAction`/`runAgent` thực sự gọi để lấy Claude API Key
 * dùng cho một Site: ưu tiên key Site tự cấu hình, rơi về biến môi trường
 * ANTHROPIC_API_KEY dùng chung nếu Site chưa cấu hình (giữ các deploy/dev
 * hiện tại dựa vào env var không bị hỏng). `null` khi cả hai đều thiếu — nơi
 * gọi tự biến thành lỗi hiển thị "chưa cấu hình", hàm này không throw.
 */
export const resolveClaudeApiKey = async (siteId: string): Promise<string | null> => {
  const siteKey = await getSiteAnthropicApiKey(siteId)
  if (siteKey) return siteKey
  return process.env.ANTHROPIC_API_KEY ?? null
}

export interface SiteAiConnection {
  readonly provider: AiProvider
  readonly model: string
}

export interface SiteAiConfig extends SiteAiConnection {
  readonly apiKey: string
}

/** Chỉ đọc trạng thái hiển thị (provider + model đang kết nối), KHÔNG giải
 * mã key — dùng cho UI Cài đặt. `null` nếu Site chưa kết nối provider nào. */
export const getSiteAiConnection = async (siteId: string): Promise<SiteAiConnection | null> => {
  const admin = createAdminClient()
  const { data } = await admin.from('site_ai_keys').select('provider, model').eq('site_id', siteId).maybeSingle()
  if (!data) return null
  return { provider: data.provider as AiProvider, model: data.model }
}

/**
 * Hàm mà `testRunPromptAction`/`runAgent` thực sự gọi để lấy cấu hình AI
 * dùng cho một Site: ưu tiên provider Site tự kết nối, rơi về Claude + biến
 * môi trường ANTHROPIC_API_KEY dùng chung nếu Site chưa kết nối gì (giữ các
 * deploy/dev hiện tại dựa vào env var không bị hỏng). `null` khi cả hai đều
 * thiếu — nơi gọi tự biến thành lỗi hiển thị "chưa cấu hình", hàm này không
 * throw.
 */
export const resolveAiConfig = async (siteId: string): Promise<SiteAiConfig | null> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_ai_keys')
    .select('provider, model, api_key_enc')
    .eq('site_id', siteId)
    .maybeSingle()

  if (data) {
    return { provider: data.provider as AiProvider, model: data.model, apiKey: decrypt(data.api_key_enc) }
  }

  const envKey = process.env.ANTHROPIC_API_KEY
  if (!envKey) return null
  return { provider: 'anthropic', model: DEFAULT_CLAUDE_MODEL, apiKey: envKey }
}
