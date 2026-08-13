import 'server-only'

import type { AuditFinding } from '@/lib/domain/audit'
import type { SiteCrawl } from '../crawler'

/**
 * Luật GEO — sẵn sàng để AI TRÍCH XUẤT nội dung khi tổng hợp câu trả lời.
 * Vài luật ở đây là suy luận có tính diễn giải (`heuristic: true`) — đọc kỹ
 * comment ở `domain/audit.ts` về ý nghĩa cờ đó trước khi thêm luật mới.
 */

const finding = (
  id: string,
  status: AuditFinding['status'],
  title: string,
  description: string,
  fix: string | null,
  evidence: string | null,
  heuristic = false,
): AuditFinding => ({ id, category: 'geo', status, title, description, fix, evidence, heuristic })

const RECOGNIZED_SCHEMA_TYPES = new Set([
  'Organization',
  'WebSite',
  'Article',
  'NewsArticle',
  'BlogPosting',
  'Product',
  'FAQPage',
  'BreadcrumbList',
  'LocalBusiness',
  'Person',
  'Review',
  'HowTo',
])

export const evaluateGeoRules = (crawl: SiteCrawl): readonly AuditFinding[] => {
  const { pages } = crawl
  if (pages.length === 0) return []

  const findings: AuditFinding[] = []

  findings.push(
    finding(
      'geo-llms-txt',
      crawl.llmsTxtExists ? 'pass' : 'warn',
      'File llms.txt',
      'llms.txt là bản khai cấu trúc site dành riêng cho AI agent đọc — không bắt buộc, nhưng agent đọc site nhanh và chính xác hơn khi có thay vì phải tự suy từ HTML.',
      crawl.llmsTxtExists ? null : 'Tạo /llms.txt liệt kê các trang/tài liệu quan trọng nhất theo định dạng Markdown.',
      crawl.llmsTxtExists ? '/llms.txt tồn tại' : 'Không tìm thấy /llms.txt',
    ),
  )

  const pagesWithSchema = pages.filter((page) => page.jsonLdTypes.length > 0).length
  const recognizedTypesFound = [
    ...new Set(pages.flatMap((page) => page.jsonLdTypes.filter((type) => RECOGNIZED_SCHEMA_TYPES.has(type)))),
  ]
  findings.push(
    finding(
      'geo-structured-data',
      pagesWithSchema === 0 ? 'fail' : pagesWithSchema < pages.length ? 'warn' : 'pass',
      'Dữ liệu có cấu trúc (JSON-LD)',
      'Schema.org (JSON-LD) là ngôn ngữ chung để AI/công cụ tìm kiếm hiểu CHÍNH XÁC một thực thể là gì (sản phẩm, bài viết, tổ chức…) thay vì phải đoán từ văn bản.',
      pagesWithSchema === 0
        ? 'Thêm khối <script type="application/ld+json"> với @type phù hợp (Organization, Article, Product, FAQPage…) vào các trang chính.'
        : pagesWithSchema < pages.length
          ? 'Bổ sung JSON-LD cho các trang còn thiếu.'
          : null,
      `${pagesWithSchema}/${pages.length} trang có JSON-LD${recognizedTypesFound.length > 0 ? ` (loại: ${recognizedTypesFound.join(', ')})` : ''}`,
    ),
  )

  // Câu trả lời trực tiếp: heading có đoạn văn ngay sau, không phải heading
  // rồi tới heading khác hoặc danh sách rỗng — cấu trúc này dễ trích xuất
  // thành một câu trả lời độc lập hơn văn bản tự do không có mốc rõ ràng.
  const pagesWithDirectAnswer = pages.filter(
    (page) => page.headings.length > 0 && Boolean(page.firstParagraph) && page.firstParagraph!.length > 40,
  ).length
  findings.push(
    finding(
      'geo-direct-answers',
      pagesWithDirectAnswer === 0 ? 'warn' : pagesWithDirectAnswer < pages.length ? 'warn' : 'pass',
      'Cấu trúc "trả lời trực tiếp"',
      'Nội dung mở đầu bằng một đoạn trả lời thẳng vào vấn đề (không phải dẫn dắt dài dòng) dễ được AI trích nguyên văn hơn khi tổng hợp câu trả lời.',
      pagesWithDirectAnswer < pages.length
        ? 'Mở đầu mỗi trang/bài viết bằng 1–3 câu trả lời trực tiếp câu hỏi chính, chi tiết/bối cảnh đưa xuống sau.'
        : null,
      `${pagesWithDirectAnswer}/${pages.length} trang có đoạn mở đầu đủ dài ngay sau heading`,
      true,
    ),
  )

  const avgWordsPerHeading = pages
    .filter((page) => page.headings.length > 0)
    .map((page) => page.wordCount / page.headings.length)
  const denseTextPages = avgWordsPerHeading.filter((ratio) => ratio > 400).length
  findings.push(
    finding(
      'geo-heading-density',
      denseTextPages === 0 ? 'pass' : denseTextPages < pages.length ? 'warn' : 'fail',
      'Mật độ heading hợp lý',
      'Những khối văn bản dài không có heading ngắt đoạn khó để AI xác định ranh giới một ý — nên chia nhỏ theo heading rõ ràng, khoảng 150–400 từ mỗi mục.',
      denseTextPages === 0
        ? null
        : 'Chia nhỏ các đoạn văn dài bằng heading phụ (H2/H3), mỗi mục nên gói gọn một ý.',
      `${pages.length - denseTextPages}/${pages.length} trang có mật độ heading hợp lý`,
      true,
    ),
  )

  const pagesWithAuthorSignal = pages.filter((page) =>
    page.jsonLdTypes.some((type) => type === 'Person' || type === 'Organization'),
  ).length
  findings.push(
    finding(
      'geo-eeat-signals',
      pagesWithAuthorSignal === 0 ? 'warn' : 'pass',
      'Tín hiệu E-E-A-T (tác giả/tổ chức)',
      'AI ưu tiên trích dẫn nguồn có thể xác định rõ ai chịu trách nhiệm nội dung — schema Person/Organization là cách khai báo rõ ràng nhất.',
      pagesWithAuthorSignal === 0
        ? 'Thêm schema Organization (trang chủ) và/hoặc Person (tác giả bài viết) qua JSON-LD.'
        : null,
      `${pagesWithAuthorSignal}/${pages.length} trang có schema Person/Organization`,
    ),
  )

  return findings
}
