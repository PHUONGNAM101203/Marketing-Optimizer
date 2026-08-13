import 'server-only'

import type { AuditFinding } from '@/lib/domain/audit'
import type { SiteCrawl } from '../crawler'

/**
 * Luật AIO — sẵn sàng cho AI Overviews/answer engine cụ thể: crawler AI có
 * vào được không, nội dung có định dạng dễ trích không (danh sách/bảng/FAQ).
 * Bổ sung, không lặp lại "Hiện diện AI" (đo citation rate SỐNG qua API) —
 * đây là các phép kiểm tra KỸ THUẬT tĩnh, đọc trực tiếp từ trang đã quét.
 */

const finding = (
  id: string,
  status: AuditFinding['status'],
  title: string,
  description: string,
  fix: string | null,
  evidence: string | null,
  heuristic = false,
): AuditFinding => ({ id, category: 'aio', status, title, description, fix, evidence, heuristic })

export const evaluateAioRules = (crawl: SiteCrawl): readonly AuditFinding[] => {
  const { pages, robots } = crawl
  if (pages.length === 0) return []

  const findings: AuditFinding[] = []

  const blockedBots = Object.entries(robots.aiBotAccess).filter(([, access]) => access === 'disallow')
  findings.push(
    finding(
      'aio-crawler-access',
      blockedBots.length === 0 ? 'pass' : 'fail',
      'Crawler AI được phép truy cập',
      'Nếu robots.txt chặn GPTBot/ClaudeBot/PerplexityBot/Google-Extended, site sẽ KHÔNG BAO GIỜ được các AI đó trích dẫn — dù nội dung tốt tới đâu, vì họ không đọc được.',
      blockedBots.length === 0
        ? null
        : `Xoá dòng chặn cho ${blockedBots.map(([bot]) => bot).join(', ')} trong robots.txt nếu muốn được AI đó trích dẫn.`,
      blockedBots.length === 0
        ? 'Không chặn crawler AI nào trong robots.txt'
        : `Đang chặn: ${blockedBots.map(([bot]) => bot).join(', ')}`,
    ),
  )

  const faqPages = pages.filter(
    (page) =>
      page.jsonLdTypes.includes('FAQPage') ||
      page.headings.filter((heading) => heading.text.trim().endsWith('?')).length >= 2,
  ).length
  findings.push(
    finding(
      'aio-faq-pattern',
      faqPages === 0 ? 'warn' : 'pass',
      'Cấu trúc FAQ hoặc câu hỏi rõ ràng',
      'FAQPage schema hoặc heading dạng câu hỏi là định dạng AI Overviews trích dẫn nhiều nhất — mỗi câu hỏi kèm câu trả lời ngắn ngay bên dưới.',
      faqPages === 0
        ? 'Thêm mục FAQ (kèm FAQPage schema) cho các trang sản phẩm/dịch vụ chính, mỗi câu hỏi có câu trả lời ngắn gọn ngay sau.'
        : null,
      `${faqPages}/${pages.length} trang có FAQPage schema hoặc ≥2 heading dạng câu hỏi`,
    ),
  )

  const listTablePages = pages.filter((page) => page.hasListOrTable).length
  findings.push(
    finding(
      'aio-extractable-format',
      listTablePages === 0 ? 'warn' : listTablePages < pages.length ? 'warn' : 'pass',
      'Định dạng dễ trích xuất (danh sách/bảng)',
      'AI Overviews ưu tiên trích nội dung dạng danh sách hoặc bảng vì dễ tóm tắt thành gạch đầu dòng — văn bản thuần khó trích chính xác hơn.',
      listTablePages < pages.length
        ? 'Trình bày thông tin dạng bước/tiêu chí/so sánh bằng <ul>/<ol>/<table> thay vì đoạn văn liền mạch.'
        : null,
      `${listTablePages}/${pages.length} trang có danh sách hoặc bảng`,
    ),
  )

  const conciseAnswerPages = pages.filter(
    (page) => Boolean(page.firstParagraph) && page.firstParagraph!.length > 20 && page.firstParagraph!.length < 300,
  ).length
  findings.push(
    finding(
      'aio-concise-summary',
      conciseAnswerPages === 0 ? 'warn' : conciseAnswerPages < pages.length ? 'warn' : 'pass',
      'Đoạn tóm tắt súc tích ở đầu trang',
      'Một đoạn mở đầu ngắn gọn (1–3 câu) tóm tắt đúng trọng tâm giúp AI Overviews trích dẫn gọn mà không cắt xén sai ý.',
      conciseAnswerPages < pages.length
        ? 'Viết lại đoạn mở đầu ngắn gọn, súc tích — tránh mở bài dài dòng trước khi vào ý chính.'
        : null,
      `${conciseAnswerPages}/${pages.length} trang có đoạn mở đầu độ dài phù hợp`,
      true,
    ),
  )

  return findings
}
