import 'server-only'

import type { PageSpeedResult, PageSpeedStrategy, PageSpeedStrategyResult } from '@/lib/domain/audit'

/**
 * Google PageSpeed Insights API v5 — CHẠY LIGHTHOUSE THẬT mỗi lần gọi, có
 * thể mất 15-30 giây một request, nên chỉ gọi cho TRANG CHỦ (không phải mọi
 * trang đã crawl). Gọi CẢ HAI chiến lược (mobile + desktop) song song — đúng
 * như trang pagespeed.web.dev thật cho phép đổi qua lại, với số liệu THỰC SỰ
 * khác nhau giữa hai chiến lược (Lighthouse mô phỏng thiết bị khác nhau).
 *
 * Lấy đủ 5 chỉ số "Lab Data" đúng như báo cáo PageSpeed Insights thật hiện
 * (FCP/LCP/TBT/CLS/Speed Index — không còn TTI, Google đã bỏ khỏi báo cáo
 * mặc định), cộng danh sách "Cơ hội cải thiện" — các audit hiệu năng kinh
 * điển của Lighthouse, chỉ lấy khi thật sự có điểm dưới ngưỡng tốt. CỐ TÌNH
 * không lấy audit chi tiết của cả 4 hạng mục (đã thử, bỏ lại) — báo cáo đầy
 * đủ, chính xác hơn nhiều đã có sẵn ở link "Mở báo cáo đầy đủ" ra thẳng
 * pagespeed.web.dev, không cần lặp lại trong app và tốn thêm chi phí xử lý
 * mỗi lượt quét.
 *
 * API KEY LÀ MỘT — CẤU HÌNH CHO TOÀN HỆ THỐNG, không phải mỗi Site tự nhập.
 * Lý do: PSI không đọc dữ liệu riêng của ai — nó chỉ chạy Lighthouse trên
 * một URL công khai bất kỳ, nên không có khái niệm "ai sở hữu key này".
 * Khác hẳn Client ID/Secret OAuth (đó mới là thứ gắn với app xin quyền đọc
 * TÀI KHOẢN của người dùng — cần một app riêng cho mỗi Site vì mỗi Site có
 * thể muốn dùng OAuth Client của chính họ). Key đọc từ biến môi trường
 * `PAGESPEED_API_KEY`, đặt một lần lúc deploy, dùng chung mọi Site.
 */

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
// Chạy SONG SONG với crawl (tới 240s, xem `actions/audit.ts::performAuditScan`)
// từ 17/8/2026 — không còn tranh chấp thời gian với phần crawl/PSI tuần tự
// như trước. Nới từ 45s lên 90s rồi 120s (site rất nặng đo được thật, 8/2026:
// handdn.com desktop mất ~30s CHẠY RIÊNG LẺ nhưng vẫn timeout khi chạy đồng
// thời với crawl 1182 trang — Node đơn luồng, JSON.parse ~1MB response PSI
// cạnh tranh CPU với việc parse HTML của crawl, không phải lỗi mạng). Vẫn
// nằm gọn trong ngân sách 240s của crawl.
const PSI_TIMEOUT_MS = 120_000

/** `null` khi biến môi trường chưa được đặt — dùng để quyết định có gọi PSI
 * hay không (không âm thầm gọi thiếu key rồi nuốt lỗi). */
export const getConfiguredPageSpeedApiKey = (): string | null =>
  process.env.PAGESPEED_API_KEY?.trim() || null

/** ID audit "cơ hội cải thiện" kinh điển của Lighthouse — cùng danh sách
 * PageSpeed Insights thật hiển thị dưới mục "Opportunities". */
const OPPORTUNITY_AUDIT_IDS = [
  'render-blocking-resources',
  'unused-css-rules',
  'unused-javascript',
  'modern-image-formats',
  'offscreen-images',
  'unminified-css',
  'unminified-javascript',
  'efficient-animated-content',
  'uses-text-compression',
  'uses-responsive-images',
  'server-response-time',
] as const

interface PsiCategory {
  readonly score?: number | null
}

interface PsiAudit {
  readonly title?: string
  readonly score?: number | null
  readonly numericValue?: number
  readonly displayValue?: string
}

interface PsiResponse {
  readonly lighthouseResult?: {
    readonly categories?: {
      readonly performance?: PsiCategory
      readonly seo?: PsiCategory
      readonly accessibility?: PsiCategory
      readonly ['best-practices']?: PsiCategory
    }
    readonly audits?: Readonly<Record<string, PsiAudit>>
  }
}

const toScore = (category: PsiCategory | undefined): number | null =>
  typeof category?.score === 'number' ? Math.round(category.score * 100) : null

const fetchPageSpeedStrategy = async (
  pageUrl: string,
  apiKey: string,
  strategy: PageSpeedStrategy,
): Promise<PageSpeedStrategyResult | null> => {
  const url = new URL(PSI_ENDPOINT)
  url.searchParams.set('url', pageUrl)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('strategy', strategy)
  for (const category of ['performance', 'seo', 'accessibility', 'best-practices']) {
    url.searchParams.append('category', category)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PSI_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url.toString(), { signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) return null

  // `response.json()` từng đứng NGOÀI try/catch — PSI trả 200 nhưng thân
  // response không parse được JSON (đã xảy ra thật, 8/2026: gây throw không
  // bắt được, làm CRASH CẢ TIẾN TRÌNH `after()` đang chạy crawl song song
  // giữa chừng — audit_runs kẹt ở `status: 'running'` mãi mãi, `error: null`,
  // vì tiến trình chết trước khi kịp chạy tới catch của `performAuditScan`).
  // Không được để một nhánh PSI lỗi làm hỏng CẢ audit đang chạy song song.
  let body: PsiResponse
  try {
    body = (await response.json()) as PsiResponse
  } catch {
    return null
  }
  const categories = body.lighthouseResult?.categories
  const audits = body.lighthouseResult?.audits ?? {}

  const opportunities = OPPORTUNITY_AUDIT_IDS.map((id) => audits[id])
    .filter((audit): audit is PsiAudit => Boolean(audit) && typeof audit.score === 'number' && audit.score < 0.9)
    .map((audit) => ({ title: audit.title ?? '—', savings: audit.displayValue ?? null }))

  return {
    strategy,
    performanceScore: toScore(categories?.performance),
    seoScore: toScore(categories?.seo),
    accessibilityScore: toScore(categories?.accessibility),
    bestPracticesScore: toScore(categories?.['best-practices']),
    fcpMs: audits['first-contentful-paint']?.numericValue ?? null,
    lcpMs: audits['largest-contentful-paint']?.numericValue ?? null,
    cls: audits['cumulative-layout-shift']?.numericValue ?? null,
    tbtMs: audits['total-blocking-time']?.numericValue ?? null,
    speedIndexMs: audits['speed-index']?.numericValue ?? null,
    opportunities,
    fetchedAt: new Date().toISOString(),
  }
}

/** Gọi song song cả hai chiến lược — mỗi nhánh lỗi độc lập (timeout desktop
 * không kéo mobile xuống `null` theo, và ngược lại). */
export const fetchPageSpeedInsights = async (pageUrl: string, apiKey: string): Promise<PageSpeedResult> => {
  const [mobile, desktop] = await Promise.all([
    fetchPageSpeedStrategy(pageUrl, apiKey, 'mobile'),
    fetchPageSpeedStrategy(pageUrl, apiKey, 'desktop'),
  ])
  return { mobile, desktop }
}
