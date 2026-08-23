import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  AuditFinding,
  AuditRun,
  AuditRunStatus,
  AuditRunSummary,
  PageSpeedResult,
  SiteProfile,
} from '@/lib/domain/audit'
import type { PageCitabilityScore } from '@/lib/domain/geo'
import type { PageSignals } from '@/lib/audit/crawler'

interface AuditRunRow {
  readonly id: string
  readonly site_id: string
  readonly status: string
  readonly pages_scanned: number
  readonly sitemap_url_count: number
  readonly truncated: boolean
  readonly blocked_by_bot_protection: boolean
  readonly seo_score: number | null
  readonly geo_score: number | null
  readonly aio_score: number | null
  readonly aeo_score: number | null
  readonly findings: unknown
  readonly page_citability: unknown
  readonly site_profile: unknown
  readonly pagespeed: unknown
  readonly global_keyword_suggestions: unknown
  readonly prompt_template_suggestions: unknown
  readonly agent_role_suggestions: unknown
  readonly error: string | null
  readonly started_at: string
  readonly completed_at: string | null
}

/**
 * Ngân sách một lượt quét tối đa là 240s (crawl) + tới ~45s (PSI) + overhead
 * — không thể nào thật sự còn "đang chạy" quá lâu hơn thế nhiều. Row nào vẫn
 * `status: 'running'` sau ngưỡng này chắc chắn đã bị NGẮT GIỮA CHỪNG (client
 * đóng kết nối do tải lại trang/đóng tab, hoặc nền tảng hosting cắt ngang) —
 * server action khi đó không bao giờ chạy tới đoạn ghi 'completed'/'failed',
 * để lại row kẹt mãi ở 'running' với dữ liệu rỗng. Tự nhận diện ở đây để
 * hiện đúng "lượt quét bị gián đoạn, thử lại" thay vì một giao diện dở dang
 * (tab điểm số toàn "—", không giải thích được vì sao) mãi mãi.
 */
const STALE_RUNNING_THRESHOLD_MS = 6 * 60 * 1000

/** Đọc `{source, [listKey]}` mới, RƠI VỀ RỖNG (không phải throw) cho hình
 * dạng CŨ/thiếu (trước khi field `source` tồn tại, hoặc audit chạy trước khi
 * cột này có) — chỉ vài row từ lúc phát triển các tính năng gợi ý AI còn
 * mang hình dạng cũ, không đáng để giữ code đọc-tương-thích-ngược lâu dài;
 * audit chạy lại là ra đúng hình dạng mới. Dùng chung cho cả 3 field gợi ý
 * (`globalKeywordSuggestions`/`promptTemplateSuggestions`/
 * `agentRoleSuggestions`) — cùng quy ước `{source, <tên mảng riêng>}`. */
const toSourceTagged = <T extends Record<string, unknown>>(value: unknown, listKey: keyof T, empty: T): T => {
  if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as T)[listKey])) {
    return value as T
  }
  return empty
}

const toAuditRunSummary = (row: AuditRunRow): AuditRunSummary => {
  const isStaleRunning =
    row.status === 'running' &&
    Date.now() - new Date(row.started_at).getTime() > STALE_RUNNING_THRESHOLD_MS

  return {
    id: row.id,
    siteId: row.site_id,
    status: isStaleRunning ? 'failed' : (row.status as AuditRunStatus),
    pagesScanned: row.pages_scanned,
    sitemapUrlCount: row.sitemap_url_count,
    truncated: row.truncated,
    blockedByBotProtection: row.blocked_by_bot_protection,
    seoScore: row.seo_score,
    geoScore: row.geo_score,
    aioScore: row.aio_score,
    aeoScore: row.aeo_score,
    findings: (row.findings as readonly AuditFinding[] | null) ?? [],
    siteProfile: row.site_profile as SiteProfile | null,
    pagespeed: row.pagespeed as PageSpeedResult | null,
    globalKeywordSuggestions: toSourceTagged(row.global_keyword_suggestions, 'suggestions', {
      source: 'template',
      suggestions: [],
    }),
    promptTemplateSuggestions: toSourceTagged(row.prompt_template_suggestions, 'templates', {
      source: 'template',
      templates: [],
    }),
    agentRoleSuggestions: toSourceTagged(row.agent_role_suggestions, 'suggestions', {
      source: 'template',
      suggestions: [],
    }),
    error: isStaleRunning
      ? 'Lượt quét trước bị gián đoạn giữa chừng (máy chủ khởi động lại hoặc gặp sự cố) — bấm "Quét tiếp" để chạy lại. Phần đã quét được ở các lượt trước đó (nếu có) không mất, lượt sau vẫn cộng dồn tiếp.'
      : row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

/** Mọi cột `toAuditRun` cần, KHÔNG gồm `page_signals` — blob JSONB lưu tín
 * hiệu crawl thô của toàn bộ sitemap, chỉ `getLatestAuditPageSignals` bên
 * dưới cần tới. Trang Tổng quan gọi hàm này trên MỌI lượt render (kể cả mỗi
 * lần đổi khoảng ngày) nên kéo cả blob đó qua dây mỗi lần là phí. */
/**
 * CỐ TÌNH không có `page_citability`.
 *
 * Cột đó giữ một điểm số cho MỖI trang đã quét. Đo thật trên production
 * (23/8/2026, site 1000+ trang): kèm nó thì một hàng là 2.060.490 bytes và
 * truy vấn mất 2,1–7,8 giây; bỏ nó ra còn 15.506 bytes và 0,22–0,47 giây —
 * nhỏ hơn 133 lần. Sáu trang gọi `getLatestAuditRun` (Tổng quan, Kênh,
 * Kiểm tra, Agents, Prompt Studio, Hiện diện AI) và mỗi trang đều phải trả
 * cái giá đó, trong khi CHỈ Hiện diện AI render danh sách này.
 */
const AUDIT_RUN_SUMMARY_COLUMNS =
  'id, site_id, status, pages_scanned, sitemap_url_count, truncated, blocked_by_bot_protection, seo_score, geo_score, aio_score, aeo_score, findings, site_profile, pagespeed, global_keyword_suggestions, prompt_template_suggestions, agent_role_suggestions, error, started_at, completed_at'

/** Cố tình viết lại đầy đủ thay vì nối chuỗi từ hằng trên: Supabase suy ra
 * kiểu trả về TỪ KIỂU LITERAL của chuỗi select. Một template literal cho ra
 * kiểu `string`, làm kết quả rơi về `any` và lan sang mọi biến cùng nằm
 * trong `Promise.all` ở phía trang gọi. */
const AUDIT_RUN_COLUMNS =
  'id, site_id, status, pages_scanned, sitemap_url_count, truncated, blocked_by_bot_protection, seo_score, geo_score, aio_score, aeo_score, findings, site_profile, pagespeed, global_keyword_suggestions, prompt_template_suggestions, agent_role_suggestions, error, started_at, completed_at, page_citability'

/** Mặc định của mọi trang. Xem `AUDIT_RUN_SUMMARY_COLUMNS` để biết vì sao
 * KHÔNG kèm `pageCitability`. */
export const getLatestAuditRun = async (siteId: string): Promise<AuditRunSummary | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('audit_runs')
    .select(AUDIT_RUN_SUMMARY_COLUMNS)
    .eq('site_id', siteId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Không đọc được lượt quét: ${error.message}`)
  return data ? toAuditRunSummary(data as AuditRunRow) : null
}

/** CHỈ dùng khi thật sự render điểm citability từng trang (hiện tại: trang
 * Hiện diện AI). Kéo thêm ~2 MB — đừng gọi "cho chắc". */
export const getLatestAuditRunWithCitability = async (
  siteId: string,
): Promise<AuditRun | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('audit_runs')
    .select(AUDIT_RUN_COLUMNS)
    .eq('site_id', siteId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Không đọc được lượt quét: ${error.message}`)
  if (!data) return null
  const row = data as AuditRunRow
  return {
    ...toAuditRunSummary(row),
    pageCitability: (row.page_citability as readonly PageCitabilityScore[] | null) ?? [],
  }
}

/**
 * Trang đã quét THÀNH CÔNG ở lượt gần nhất — dùng để lượt quét MỚI ưu tiên
 * những URL chưa từng quét, và ghép (merge) thành một tập cộng dồn thay vì
 * mỗi lượt "Quét lại" lại quét đúng phần đầu sitemap rồi hết giờ ở cùng một
 * chỗ. Xem `actions/audit.ts::runSiteAuditAction`.
 *
 * CỐ TÌNH lọc `page_signals is not null` thay vì chỉ lấy row mới nhất theo
 * `started_at` — một lượt quét bị NGẮT GIỮA CHỪNG (xem `STALE_RUNNING_THRESHOLD_MS`
 * ở trên) tạo ra row mới nhất nhưng `page_signals` rỗng; nếu lấy đúng row đó
 * làm "tiến độ đã có", lượt quét kế tiếp sẽ ghép vào một tập RỖNG và xoá sạch
 * mọi tiến độ cộng dồn từ trước — tệ hơn cả việc không sửa gì.
 *
 * Dùng ADMIN client, không dùng phiên người dùng — hàm này chỉ được gọi từ
 * bên trong `after()` (chạy SAU khi response đã gửi cho client), bối cảnh
 * cookie của request gốc không còn đáng tin cậy để dựa vào lúc đó.
 */
export const getLatestAuditPageSignals = async (siteId: string): Promise<readonly PageSignals[]> => {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('audit_runs')
    .select('page_signals')
    .eq('site_id', siteId)
    .not('page_signals', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Không đọc được lượt quét trước: ${error.message}`)
  return (data?.page_signals as unknown as readonly PageSignals[] | null) ?? []
}
