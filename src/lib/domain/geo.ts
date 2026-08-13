import type { IsoDate } from '@/lib/metrics/types'

/**
 * AI Visibility — GEO / AIO.
 *
 * SEO truyền thống hỏi "trang của tôi xếp thứ mấy?". GEO hỏi một câu khác hẳn:
 * "khi có người hỏi ChatGPT về lĩnh vực này, thương hiệu tôi có được nhắc tới
 * không, và nói gì về tôi?". Không có thứ hạng, chỉ có được trích dẫn hay không,
 * nên mô hình dữ liệu phải khác — đó là lý do module này không dùng chung
 * `metrics_daily` với các nền tảng quảng cáo.
 */

export const AI_ENGINES = [
  'chatgpt',
  'perplexity',
  'google-ai-overview',
  'claude',
  'gemini',
  'copilot',
] as const

export type AiEngine = (typeof AI_ENGINES)[number]

export const AI_ENGINE_LABELS: Readonly<Record<AiEngine, string>> = {
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
  'google-ai-overview': 'Google AI Overviews',
  claude: 'Claude',
  gemini: 'Gemini',
  copilot: 'Copilot',
}

/**
 * Một câu hỏi được theo dõi định kỳ trên các engine.
 * Đây là đơn vị đo của GEO, tương đương "từ khoá" của SEO cũ.
 */
export interface TrackedPrompt {
  readonly id: string
  readonly siteId: string
  readonly text: string
  readonly intent: PromptIntent
  readonly engines: readonly AiEngine[]
  readonly cadence: 'daily' | 'weekly'
  readonly enabled: boolean
  readonly createdAt: string
}

export type PromptIntent =
  | 'informational'
  | 'comparison'
  | 'recommendation'
  | 'transactional'

export const PROMPT_INTENT_LABELS: Readonly<Record<PromptIntent, string>> = {
  informational: 'Tìm hiểu',
  comparison: 'So sánh',
  recommendation: 'Xin gợi ý',
  transactional: 'Sẵn sàng mua',
}

/** Kết quả một lần chạy: engine trả lời gì và có nhắc tới ta không. */
export interface CitationCheck {
  readonly id: string
  readonly promptId: string
  readonly engine: AiEngine
  readonly checkedAt: string
  readonly date: IsoDate
  readonly cited: boolean
  /** Vị trí xuất hiện trong câu trả lời, 1 là sớm nhất. `null` khi không được nhắc. */
  readonly position: number | null
  readonly sentiment: CitationSentiment | null
  /** Trích đoạn nguyên văn phần nhắc tới thương hiệu. */
  readonly excerpt: string | null
  readonly citedUrl: string | null
  /** Thương hiệu khác cùng xuất hiện trong câu trả lời đó. */
  readonly competitorsCited: readonly string[]
}

export type CitationSentiment = 'positive' | 'neutral' | 'negative'

export const SENTIMENT_LABELS: Readonly<Record<CitationSentiment, string>> = {
  positive: 'Tích cực',
  neutral: 'Trung lập',
  negative: 'Tiêu cực',
}

/** Tỉ lệ được nhắc tới trên tổng số lần kiểm tra, theo engine. */
export interface VisibilityShare {
  readonly engine: AiEngine
  readonly checksRun: number
  readonly timesCited: number
  readonly citationRate: number
  readonly averagePosition: number | null
  readonly shareOfVoice: number
}

/**
 * Điểm khả năng được AI trích dẫn của một trang.
 *
 * Sáu trục dưới đây là những thứ quyết định một mô hình có trích được trang hay
 * không: nó có phân tích được cấu trúc, có tin được nguồn, có tìm thấy câu trả
 * lời gọn để trích, và trang có tự khai báo mình là thực thể gì.
 */
export interface PageCitabilityScore {
  readonly id: string
  readonly siteId: string
  readonly url: string
  readonly title: string
  readonly overall: number
  readonly axes: CitabilityAxes
  readonly issues: readonly CitabilityIssue[]
  readonly scannedAt: string
}

export interface CitabilityAxes {
  /** Heading phân cấp rõ, đoạn ngắn, có danh sách — mô hình bóc tách được. */
  readonly structure: number
  /** Có JSON-LD hợp lệ, khai báo đúng loại thực thể. */
  readonly schema: number
  /** Có đoạn trả lời trực tiếp, gọn, đứng độc lập được. */
  readonly answerability: number
  /** Có tác giả, ngày cập nhật, dẫn nguồn — tín hiệu đáng tin. */
  readonly trust: number
  /** Thực thể được gọi tên nhất quán, không dùng đại từ mơ hồ. */
  readonly entityClarity: number
  /** Nội dung còn mới so với chủ đề. */
  readonly freshness: number
}

export const CITABILITY_AXIS_LABELS: Readonly<Record<keyof CitabilityAxes, string>> = {
  structure: 'Cấu trúc',
  schema: 'Schema',
  answerability: 'Khả năng trả lời',
  trust: 'Độ tin cậy',
  entityClarity: 'Rõ thực thể',
  freshness: 'Độ mới',
}

export interface CitabilityIssue {
  readonly axis: keyof CitabilityAxes
  readonly severity: 'high' | 'medium' | 'low'
  readonly message: string
  readonly fix: string
}

/** Trạng thái file `llms.txt` — bản kê khai cho agent đọc site. */
export interface LlmsTxtStatus {
  readonly present: boolean
  readonly url: string
  readonly lastCheckedAt: string
  readonly validSyntax: boolean
  readonly sectionsDeclared: readonly string[]
  readonly warnings: readonly string[]
}
