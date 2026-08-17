import 'server-only'

import type { CitabilityAxes, CitabilityIssue, PageCitabilityScore } from '@/lib/domain/geo'
import type { PageSignals } from './crawler'

/**
 * Điểm citability THẬT — tính từ chính dữ liệu đã crawl cho lượt quét
 * SEO/GEO/AIO/AEO (`crawler.ts`), không quét thêm lần nào riêng. Sáu trục ở đây
 * là một cách nhìn KHÁC của cùng tín hiệu kỹ thuật dùng cho luật GEO
 * (`rules/geo.ts`) — điểm số ít, dễ đọc; bảng này xếp theo TRANG để biết
 * chính xác trang nào cần sửa trước.
 */

const clamp = (value: number): number => Math.max(0, Math.min(100, Math.round(value)))

const scoreStructure = (page: PageSignals): number => {
  let score = 0
  if (page.h1Count === 1) score += 40
  if (page.headings.length >= 2) score += 30
  if (page.hasListOrTable) score += 30
  return clamp(score)
}

const scoreSchema = (page: PageSignals): number => {
  if (page.jsonLdTypes.length === 0) return 15
  return 100
}

const scoreAnswerability = (page: PageSignals): number => {
  if (!page.firstParagraph) return 15
  const length = page.firstParagraph.length
  if (length >= 40 && length <= 300) return 100
  return 55
}

const scoreTrust = (page: PageSignals): number => {
  let score = 0
  if (page.url.startsWith('https://')) score += 30
  if (page.jsonLdTypes.some((type) => type === 'Person' || type === 'Organization')) score += 40
  if (page.canonical) score += 30
  return clamp(score)
}

const scoreEntityClarity = (page: PageSignals): number => {
  let score = 0
  if (page.title && page.title.length >= 10 && page.title.length <= 60) score += 40
  if (page.jsonLdTypes.length > 0) score += 30
  if (page.h1Count === 1) score += 30
  return clamp(score)
}

const scoreFreshness = (page: PageSignals): number => (page.hasDateSignal ? 100 : 35)

const computeAxes = (page: PageSignals): CitabilityAxes => ({
  structure: scoreStructure(page),
  schema: scoreSchema(page),
  answerability: scoreAnswerability(page),
  trust: scoreTrust(page),
  entityClarity: scoreEntityClarity(page),
  freshness: scoreFreshness(page),
})

const AXIS_ISSUES: Readonly<
  Record<keyof CitabilityAxes, { readonly message: string; readonly fix: string }>
> = {
  structure: {
    message: 'Thiếu heading rõ ràng hoặc danh sách/bảng để AI bóc tách nội dung.',
    fix: 'Chia nội dung theo heading H2/H3, dùng danh sách hoặc bảng khi liệt kê nhiều mục.',
  },
  schema: {
    message: 'Không có dữ liệu có cấu trúc (JSON-LD) để AI xác định đây là thực thể gì.',
    fix: 'Thêm khối <script type="application/ld+json"> với @type phù hợp (Article, Product, Organization…).',
  },
  answerability: {
    message: 'Đoạn mở đầu không đủ ngắn gọn để trích thành một câu trả lời độc lập.',
    fix: 'Viết lại 1–3 câu mở đầu trả lời thẳng vào câu hỏi chính, chi tiết đưa xuống sau.',
  },
  trust: {
    message: 'Thiếu tín hiệu đáng tin (HTTPS, canonical, hoặc schema tác giả/tổ chức).',
    fix: 'Bật HTTPS, thêm canonical, khai báo schema Organization hoặc Person.',
  },
  entityClarity: {
    message: 'Tiêu đề hoặc cấu trúc trang chưa khai rõ đây là thực thể/chủ đề gì.',
    fix: 'Đặt tiêu đề 10–60 ký tự mô tả đúng chủ đề, giữ đúng một H1, bổ sung schema.',
  },
  freshness: {
    message: 'Không tìm thấy tín hiệu ngày cập nhật (dateModified hoặc thẻ <time>).',
    fix: 'Khai dateModified trong schema hoặc hiện rõ ngày cập nhật gần nhất trên trang.',
  },
}

const severityOf = (score: number): CitabilityIssue['severity'] =>
  score < 40 ? 'high' : score < 70 ? 'medium' : 'low'

const issuesOf = (axes: CitabilityAxes): readonly CitabilityIssue[] =>
  (Object.entries(axes) as [keyof CitabilityAxes, number][])
    .filter(([, score]) => score < 70)
    .map(([axis, score]) => ({
      axis,
      severity: severityOf(score),
      message: AXIS_ISSUES[axis].message,
      fix: AXIS_ISSUES[axis].fix,
    }))

export const computePageCitability = (
  page: PageSignals,
  siteId: string,
  scannedAt: string,
): PageCitabilityScore => {
  const axes = computeAxes(page)
  const overall = clamp(
    (axes.structure + axes.schema + axes.answerability + axes.trust + axes.entityClarity + axes.freshness) / 6,
  )

  return {
    id: page.url,
    siteId,
    url: page.url,
    title: page.title ?? page.url,
    overall,
    axes,
    issues: issuesOf(axes),
    scannedAt,
  }
}
