import 'server-only'

import type { AuditFinding } from '@/lib/domain/audit'
import type { SiteCrawl } from '../crawler'

/**
 * Luật AEO — nội dung có được cấu trúc để bị trích NGUYÊN VĂN làm câu trả lời
 * (featured snippet, trợ lý giọng nói, "People Also Ask", FAQ rich result)
 * hay không. Hai luật đầu (`aeo-faq-pattern`, `aeo-direct-answer`) chuyển từ
 * AIO/GEO sang đây — đó mới đúng là điều chúng đo lường, xem
 * docs/superpowers/specs/2026-08-17-aeo-audit-category-design.md.
 */

const finding = (
  id: string,
  status: AuditFinding['status'],
  title: string,
  description: string,
  fix: string | null,
  evidence: string | null,
  heuristic = false,
): AuditFinding => ({ id, category: 'aeo', status, title, description, fix, evidence, heuristic })

const HOWTO_TITLE_PATTERN = /\b(cách|hướng dẫn|how to)\b/i

export const evaluateAeoRules = (crawl: SiteCrawl): readonly AuditFinding[] => {
  const { pages } = crawl
  if (pages.length === 0) return []

  const findings: AuditFinding[] = []

  const faqPages = pages.filter(
    (page) =>
      page.jsonLdTypes.includes('FAQPage') ||
      page.headings.filter((heading) => heading.text.trim().endsWith('?')).length >= 2,
  ).length
  findings.push(
    finding(
      'aeo-faq-pattern',
      faqPages === 0 ? 'warn' : 'pass',
      'Cấu trúc FAQ hoặc câu hỏi rõ ràng',
      'FAQPage schema hoặc heading dạng câu hỏi là định dạng answer engine (AI Overviews, trợ lý giọng nói, "People Also Ask") trích dẫn nhiều nhất — mỗi câu hỏi kèm câu trả lời ngắn ngay bên dưới.',
      faqPages === 0
        ? 'Thêm mục FAQ (kèm FAQPage schema) cho các trang sản phẩm/dịch vụ chính, mỗi câu hỏi có câu trả lời ngắn gọn ngay sau.'
        : null,
      `${faqPages}/${pages.length} trang có FAQPage schema hoặc ≥2 heading dạng câu hỏi`,
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
      'aeo-direct-answer',
      pagesWithDirectAnswer === 0 ? 'warn' : pagesWithDirectAnswer < pages.length ? 'warn' : 'pass',
      'Cấu trúc "trả lời trực tiếp"',
      'Nội dung mở đầu bằng một đoạn trả lời thẳng vào vấn đề (không phải dẫn dắt dài dòng) dễ được answer engine trích nguyên văn hơn khi tổng hợp câu trả lời.',
      pagesWithDirectAnswer < pages.length
        ? 'Mở đầu mỗi trang/bài viết bằng 1–3 câu trả lời trực tiếp câu hỏi chính, chi tiết/bối cảnh đưa xuống sau.'
        : null,
      `${pagesWithDirectAnswer}/${pages.length} trang có đoạn mở đầu đủ dài ngay sau heading`,
      true,
    ),
  )

  // Chỉ trang có tiêu đề dạng hướng dẫn mới cần HowTo schema — không phạt các
  // trang khác vì "thiếu" một schema không liên quan tới nội dung của chúng.
  // Không phát hiện trang hướng dẫn nào thì coi là 'pass' (không áp dụng),
  // KHÔNG bỏ qua finding — giữ số lượng finding cố định như mọi luật khác.
  const howToCandidatePages = pages.filter((page) => page.title && HOWTO_TITLE_PATTERN.test(page.title))
  const howToWithSchema = howToCandidatePages.filter((page) => page.jsonLdTypes.includes('HowTo')).length
  findings.push(
    finding(
      'aeo-howto-schema',
      howToCandidatePages.length === 0 || howToWithSchema === howToCandidatePages.length ? 'pass' : 'warn',
      'Schema HowTo cho nội dung hướng dẫn',
      'Trang có tiêu đề dạng hướng dẫn ("cách...", "hướng dẫn...") nhưng thiếu HowTo schema thì answer engine khó nhận ra đây là quy trình từng bước để trích dẫn dạng danh sách bước.',
      howToCandidatePages.length > 0 && howToWithSchema < howToCandidatePages.length
        ? 'Thêm khối JSON-LD @type: HowTo với các "step" tương ứng cho các trang hướng dẫn.'
        : null,
      howToCandidatePages.length === 0
        ? 'Không phát hiện trang nội dung hướng dẫn nào'
        : `${howToWithSchema}/${howToCandidatePages.length} trang hướng dẫn có HowTo schema`,
      true,
    ),
  )

  // Nâng cao/tuỳ chọn — hầu hết site chưa khai schema này, phạt 'fail' sẽ đánh
  // giá quá khắt khe so với mức phổ biến thực tế, nên chỉ 'warn' khi thiếu.
  const speakablePages = pages.filter((page) => page.jsonLdTypes.includes('SpeakableSpecification')).length
  findings.push(
    finding(
      'aeo-speakable-schema',
      speakablePages === 0 ? 'warn' : 'pass',
      'Schema Speakable cho trợ lý giọng nói',
      'SpeakableSpecification (schema.org) đánh dấu đoạn nội dung phù hợp để trợ lý giọng nói (Google Assistant, Siri) đọc thành tiếng — ít site khai báo nên đây là cơ hội cải thiện, không phải lỗi nghiêm trọng.',
      speakablePages === 0
        ? 'Thêm khối JSON-LD @type: SpeakableSpecification trỏ tới đoạn mở đầu/tóm tắt của các trang chính, nếu nhắm tới trợ lý giọng nói.'
        : null,
      `${speakablePages}/${pages.length} trang có SpeakableSpecification`,
    ),
  )

  const pagesWithHeadings = pages.filter((page) => page.headings.length > 0)
  const pagesWithSomeQuestionHeadings = pagesWithHeadings.filter((page) =>
    page.headings.some((heading) => heading.text.trim().endsWith('?')),
  ).length
  findings.push(
    finding(
      'aeo-question-heading-ratio',
      pagesWithHeadings.length === 0
        ? 'warn'
        : pagesWithSomeQuestionHeadings === 0
          ? 'warn'
          : pagesWithSomeQuestionHeadings < pagesWithHeadings.length
            ? 'warn'
            : 'pass',
      'Heading dạng câu hỏi',
      'Heading viết dưới dạng câu hỏi ("Làm sao để...?", "X là gì?") khớp trực tiếp với cách người dùng gõ vào ô tìm kiếm/hỏi trợ lý giọng nói — dễ được chọn vào "People Also Ask" hoặc làm câu trả lời trực tiếp hơn heading dạng khẳng định.',
      pagesWithSomeQuestionHeadings < pagesWithHeadings.length
        ? 'Diễn đạt lại một số heading phụ (H2/H3) dưới dạng câu hỏi mà người đọc thực sự có thể gõ tìm kiếm.'
        : null,
      `${pagesWithSomeQuestionHeadings}/${pagesWithHeadings.length} trang có ít nhất 1 heading dạng câu hỏi`,
      true,
    ),
  )

  return findings
}
