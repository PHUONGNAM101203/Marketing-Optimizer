import 'server-only'

import { decrypt } from '@/lib/crypto'
import { DEFAULT_CLAUDE_MODEL } from '@/lib/providers/anthropic'
import { listAvailableModels } from '@/lib/providers/ai'
import type { AiProvider } from '@/lib/providers/ai'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Cấu hình AI do từng Site tự khai báo — đọc từ két `site_ai_keys`.
 *
 * Bảng đó cố tình không có RLS policy nào (xem migration
 * 20260817000001_site_ai_keys.sql), giống hệt `site_oauth_apps`/
 * `connection_secrets`. Đọc ở đây LUÔN qua `service_role`, và LUÔN sau khi
 * nơi gọi đã tự xác minh quyền — bảng này không tự bảo vệ được bằng RLS.
 */

export interface SiteAiConnection {
  readonly provider: AiProvider
  readonly model: string
  readonly availableModels: readonly string[]
  readonly modelsFetchedAt: string | null
}

export interface SiteAiConfig extends SiteAiConnection {
  readonly apiKey: string
}

/** Chỉ đọc trạng thái hiển thị (provider + model đang kết nối + cache danh
 * sách model), KHÔNG giải mã key — dùng cho UI Cài đặt. `null` nếu Site chưa
 * kết nối provider nào. */
export const getSiteAiConnection = async (siteId: string): Promise<SiteAiConnection | null> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_ai_keys')
    .select('provider, model, available_models, models_fetched_at')
    .eq('site_id', siteId)
    .maybeSingle()
  if (!data) return null
  return {
    provider: data.provider as AiProvider,
    model: data.model,
    availableModels: data.available_models as readonly string[],
    modelsFetchedAt: data.models_fetched_at,
  }
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
    .select('provider, model, api_key_enc, available_models, models_fetched_at')
    .eq('site_id', siteId)
    .maybeSingle()

  if (data) {
    return {
      provider: data.provider as AiProvider,
      model: data.model,
      apiKey: decrypt(data.api_key_enc),
      availableModels: data.available_models as readonly string[],
      modelsFetchedAt: data.models_fetched_at,
    }
  }

  const envKey = process.env.ANTHROPIC_API_KEY
  if (!envKey) return null
  return {
    provider: 'anthropic',
    model: DEFAULT_CLAUDE_MODEL,
    apiKey: envKey,
    availableModels: [],
    modelsFetchedAt: null,
  }
}

/**
 * Cron gọi hàm NÀY một lần, KHÔNG tự lặp qua site_ai_keys — làm mới cache
 * `available_models` cho MỌI Site đang kết nối provider nào đó. Chạy SONG
 * SONG (`Promise.allSettled`), khác vòng lặp đồng bộ connection tuần tự
 * trong `cron/sync-daily/route.ts` (nơi hàm này được gọi) — vòng đó cố tình
 * tuần tự để tránh chạm rate
 * limit DÙNG CHUNG của Google, còn ở đây mỗi Site gọi một provider/key khác
 * nhau, không có rate limit dùng chung nào để tránh. Lỗi ở một Site không
 * chặn các Site khác.
 */
export const refreshAllSiteAiModelCaches = async (): Promise<{ readonly refreshed: number; readonly failed: number }> => {
  const admin = createAdminClient()
  const { data: rows } = await admin.from('site_ai_keys').select('site_id, provider, api_key_enc')

  const results = await Promise.allSettled(
    (rows ?? []).map(async (row) => {
      const apiKey = decrypt(row.api_key_enc)
      const models = await listAvailableModels(row.provider as AiProvider, apiKey)
      const { error } = await admin
        .from('site_ai_keys')
        .update({ available_models: [...models], models_fetched_at: new Date().toISOString() })
        .eq('site_id', row.site_id)
      if (error) throw new Error(error.message)
    }),
  )

  let refreshed = 0
  let failed = 0
  // `Promise.allSettled` giữ đúng thứ tự mảng input — đối chiếu theo index
  // với `rows` để log kèm site_id, không thì N site lỗi cùng lúc sẽ không
  // phân biệt được lỗi thuộc site nào từ log cron.
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      refreshed += 1
    } else {
      failed += 1
      const siteId = rows?.[index]?.site_id ?? 'không rõ'
      console.error(
        `Không làm mới được danh sách model cho site ${siteId}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
      )
    }
  })

  return { refreshed, failed }
}
