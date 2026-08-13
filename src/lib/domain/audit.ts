/**
 * Kiểm tra SEO/GEO/AIO — quét kỹ thuật toàn site, KHÁC HẲN "Hiện diện AI".
 *
 * "Hiện diện AI" (`geo.ts`) đo TRẠNG THÁI SỐNG: có bị ChatGPT/Perplexity trích
 * dẫn không, ngay lúc hỏi. Trang này đo NỀN TẢNG KỸ THUẬT làm cho việc đó dễ
 * hay khó xảy ra — thẻ meta, schema, robots.txt, cấu trúc heading… Một site
 * có thể citability thấp (ít được hỏi tới) nhưng nền tảng kỹ thuật vẫn tốt,
 * hoặc ngược lại — hai trục độc lập, không suy ra nhau được.
 *
 * Ba hạng mục cố tình KHÔNG trộn chung một điểm:
 *   · SEO — nền tảng kỹ thuật cho công cụ tìm kiếm truyền thống (Google/Bing).
 *   · GEO (Generative Engine Optimization) — sẵn sàng để AI TRÍCH XUẤT nội
 *     dung khi tổng hợp câu trả lời (llms.txt, schema, cấu trúc trả lời trực
 *     tiếp).
 *   · AIO — sẵn sàng cho AI Overviews/answer engine cụ thể: crawler AI có bị
 *     chặn không, có định dạng dễ trích (danh sách/bảng/FAQ) không.
 */

import type { PageCitabilityScore } from './geo'

export type AuditCategory = 'seo' | 'geo' | 'aio'

export const AUDIT_CATEGORIES: readonly AuditCategory[] = ['seo', 'geo', 'aio']

export const AUDIT_CATEGORY_LABELS: Readonly<Record<AuditCategory, string>> = {
  seo: 'SEO',
  geo: 'GEO',
  aio: 'AIO',
}

export const AUDIT_CATEGORY_DESCRIPTIONS: Readonly<Record<AuditCategory, string>> = {
  seo: 'Nền tảng kỹ thuật cho Google/Bing tìm và xếp hạng trang — thẻ meta, heading, tốc độ cấu trúc, sitemap.',
  geo: 'Sẵn sàng để AI (ChatGPT, Perplexity, Claude…) trích xuất đúng nội dung khi tổng hợp câu trả lời — llms.txt, schema, cấu trúc trả lời trực tiếp.',
  aio: 'Sẵn sàng cho AI Overviews và answer engine — crawler AI có được phép vào không, nội dung có định dạng dễ trích (danh sách/bảng/FAQ) không.',
}

export type AuditFindingStatus = 'pass' | 'warn' | 'fail'

export const AUDIT_STATUS_LABELS: Readonly<Record<AuditFindingStatus, string>> = {
  pass: 'Đạt',
  warn: 'Cần chú ý',
  fail: 'Chưa đạt',
}

export interface AuditFinding {
  readonly id: string
  readonly category: AuditCategory
  readonly status: AuditFindingStatus
  readonly title: string
  readonly description: string
  /** Cách khắc phục cụ thể — không có tức đây là điểm mạnh, không cần fix. */
  readonly fix: string | null
  /** Bằng chứng đọc được TRỰC TIẾP từ trang đã quét — vd. "3/8 trang thiếu
   * meta description". `null` khi là một câu nhận định chung không có số. */
  readonly evidence: string | null
  /** `true` khi đây là suy luận có tính diễn giải (vd. "đoạn mở đầu có phải
   * câu trả lời trực tiếp không"), không phải một phép kiểm tra tất định
   * (vd. "thẻ canonical có tồn tại không"). Hiện nhãn "phỏng đoán" ở UI —
   * không giả vờ chắc chắn hơn thực tế. */
  readonly heuristic: boolean
}

export type AuditRunStatus = 'running' | 'completed' | 'failed'

/**
 * Ước tính lĩnh vực/chủ đề từ CHÍNH nội dung đã crawl (khớp từ khoá), không
 * gọi AI nào — nền cho tính năng "AI tự phát hiện" sâu hơn sau này. Xem
 * `lib/audit/site-profile.ts` cho thuật toán.
 */
export interface SiteProfile {
  readonly businessName: string | null
  readonly description: string | null
  readonly category: string | null
  /** 'high' khi tín hiệu đến từ schema.org Organization (site tự khai),
   * 'medium'/'low' khi chỉ suy từ khớp từ khoá trong nội dung. */
  readonly categoryConfidence: 'high' | 'medium' | 'low' | null
  readonly topKeywords: readonly string[]
  readonly pagesAnalyzed: number
  readonly computedAt: string
}

/** Một audit "cơ hội cải thiện" — cùng khái niệm mục "Opportunities" trong
 * báo cáo PageSpeed Insights thật. */
export interface PageSpeedOpportunity {
  readonly title: string
  /** Chuỗi Google tự định dạng, vd. "Potential savings of 1.2 s" — không
   * parse lại thành số, hiện nguyên văn để không lệch ý so với PSI thật. */
  readonly savings: string | null
}

export type PageSpeedStrategy = 'mobile' | 'desktop'

/** Kết quả PageSpeed Insights cho MỘT chiến lược (mobile hoặc desktop) — hai
 * chiến lược cho số liệu khác nhau thật sự (Google chạy Lighthouse riêng cho
 * từng loại thiết bị mô phỏng), không phải cùng một số hiển thị hai lần.
 *
 * CỐ TÌNH chỉ lấy 4 điểm số + 5 chỉ số Lab Data + "cơ hội cải thiện" hiệu
 * năng — không lấy audit chi tiết của cả 4 hạng mục (đã thử, bỏ lại): tốn
 * thêm chi phí xử lý mỗi lượt quét mà báo cáo đầy đủ, chính xác hơn nhiều đã
 * có sẵn ở "Mở báo cáo đầy đủ" (link ra pagespeed.web.dev thật). */
export interface PageSpeedStrategyResult {
  readonly strategy: PageSpeedStrategy
  readonly performanceScore: number | null
  readonly seoScore: number | null
  readonly accessibilityScore: number | null
  readonly bestPracticesScore: number | null
  readonly fcpMs: number | null
  readonly lcpMs: number | null
  readonly cls: number | null
  readonly tbtMs: number | null
  readonly speedIndexMs: number | null
  readonly opportunities: readonly PageSpeedOpportunity[]
  readonly fetchedAt: string
}

/** Google PageSpeed Insights — chỉ gọi cho trang chủ, xem `lib/audit/pagespeed.ts`.
 * Lấy CẢ HAI chiến lược mỗi lượt quét (giống trang pagespeed.web.dev thật, nơi
 * người dùng bấm đổi qua lại Mobile/Desktop). Từng nhánh có thể `null` riêng
 * nếu lượt gọi PSI cho chiến lược đó lỗi/timeout — không kéo cả hai xuống null. */
export interface PageSpeedResult {
  readonly mobile: PageSpeedStrategyResult | null
  readonly desktop: PageSpeedStrategyResult | null
}

export interface AuditRun {
  readonly id: string
  readonly siteId: string
  readonly status: AuditRunStatus
  readonly pagesScanned: number
  /** Tổng URL sitemap khai báo — có thể LỚN HƠN `pagesScanned` nếu site vượt
   * ngân sách quét (`crawler.ts::MAX_PAGES`). */
  readonly sitemapUrlCount: number
  readonly truncated: boolean
  /** `true` khi trang chủ trả về màn hình chặn bot (Cloudflare/WAF) thay vì
   * nội dung thật — điểm số/hồ sơ bên dưới không đáng tin, phải báo rõ. */
  readonly blockedByBotProtection: boolean
  readonly seoScore: number | null
  readonly geoScore: number | null
  readonly aioScore: number | null
  readonly findings: readonly AuditFinding[]
  readonly pageCitability: readonly PageCitabilityScore[]
  readonly siteProfile: SiteProfile | null
  readonly pagespeed: PageSpeedResult | null
  readonly error: string | null
  readonly startedAt: string
  readonly completedAt: string | null
}

export const scoreOf = (run: AuditRun, category: AuditCategory): number | null =>
  category === 'seo' ? run.seoScore : category === 'geo' ? run.geoScore : run.aioScore

export const findingsOf = (
  run: AuditRun,
  category: AuditCategory,
): readonly AuditFinding[] => run.findings.filter((finding) => finding.category === category)

/** Điểm 0–100 từ tỉ lệ pass/warn/fail — warn tính nửa trọng số, không bị coi
 * ngang fail (một cảnh báo nhẹ không nên kéo điểm sập như một lỗi thật). */
export const computeCategoryScore = (findings: readonly AuditFinding[]): number | null => {
  if (findings.length === 0) return null
  const weight: Readonly<Record<AuditFindingStatus, number>> = { pass: 1, warn: 0.5, fail: 0 }
  const total = findings.reduce((sum, finding) => sum + weight[finding.status], 0)
  return Math.round((total / findings.length) * 100)
}
