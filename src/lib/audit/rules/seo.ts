import 'server-only'

import type { AuditFinding } from '@/lib/domain/audit'
import type { SiteCrawl } from '../crawler'

/**
 * Luật SEO kỹ thuật — mỗi luật đọc TRỰC TIẾP dữ liệu đã quét, không suy đoán.
 * Mỗi luật trả về ĐÚNG MỘT `AuditFinding` tổng hợp qua mọi trang đã quét
 * (không phải một finding riêng cho từng trang) — giữ danh sách đọc được,
 * "3/8 trang thiếu X" rõ ràng hơn tám dòng riêng lẻ nói cùng một chuyện.
 */

const finding = (
  id: string,
  status: AuditFinding['status'],
  title: string,
  description: string,
  fix: string | null,
  evidence: string | null,
): AuditFinding => ({ id, category: 'seo', status, title, description, fix, evidence, heuristic: false })

const ratioStatus = (bad: number, total: number, warnThreshold: number): AuditFinding['status'] => {
  if (total === 0) return 'warn'
  if (bad === 0) return 'pass'
  return bad / total <= warnThreshold ? 'warn' : 'fail'
}

export const evaluateSeoRules = (crawl: SiteCrawl): readonly AuditFinding[] => {
  const { pages } = crawl
  if (pages.length === 0) {
    return [
      finding(
        'seo-no-pages',
        'fail',
        'Không quét được trang nào',
        'Không lấy được HTML của bất kỳ trang nào — có thể server chặn crawler hoặc domain không phản hồi.',
        'Kiểm tra domain có truy cập công khai được không, hoặc thử quét lại.',
        null,
      ),
    ]
  }

  const findings: AuditFinding[] = []

  const httpsCount = pages.filter((page) => page.url.startsWith('https://')).length
  findings.push(
    finding(
      'seo-https',
      httpsCount === pages.length ? 'pass' : 'fail',
      'Toàn bộ trang dùng HTTPS',
      'HTTPS là yêu cầu cơ bản để Google tin tưởng xếp hạng, và trình duyệt cảnh báo "Not secure" nếu thiếu.',
      httpsCount === pages.length ? null : 'Bật HTTPS cho toàn bộ trang, chuyển hướng 301 từ HTTP.',
      `${httpsCount}/${pages.length} trang dùng HTTPS`,
    ),
  )

  const missingTitle = pages.filter((page) => !page.title).length
  findings.push(
    finding(
      'seo-title-tag',
      ratioStatus(missingTitle, pages.length, 0.2),
      'Thẻ <title> đầy đủ',
      'Mỗi trang cần một thẻ title riêng, mô tả đúng nội dung trang — Google dùng nó làm tiêu đề kết quả tìm kiếm.',
      missingTitle === 0 ? null : 'Thêm thẻ <title> riêng cho từng trang, 10–60 ký tự, chứa từ khoá chính.',
      `${pages.length - missingTitle}/${pages.length} trang có title`,
    ),
  )

  const missingDescription = pages.filter((page) => !page.metaDescription).length
  findings.push(
    finding(
      'seo-meta-description',
      ratioStatus(missingDescription, pages.length, 0.3),
      'Meta description đầy đủ',
      'Meta description không ảnh hưởng thứ hạng trực tiếp nhưng quyết định người dùng có bấm vào kết quả tìm kiếm không.',
      missingDescription === 0
        ? null
        : 'Thêm <meta name="description"> 50–160 ký tự, tóm tắt đúng nội dung trang.',
      `${pages.length - missingDescription}/${pages.length} trang có meta description`,
    ),
  )

  const wrongH1Count = pages.filter((page) => page.h1Count !== 1).length
  findings.push(
    finding(
      'seo-single-h1',
      ratioStatus(wrongH1Count, pages.length, 0.2),
      'Mỗi trang có đúng một thẻ H1',
      'Nhiều H1 hoặc không có H1 làm mất tín hiệu "đây là chủ đề chính của trang" với công cụ tìm kiếm.',
      wrongH1Count === 0 ? null : 'Sửa mỗi trang còn lại đúng MỘT thẻ H1 duy nhất, các heading khác dùng H2 trở xuống.',
      `${pages.length - wrongH1Count}/${pages.length} trang có đúng 1 H1`,
    ),
  )

  const missingCanonical = pages.filter((page) => !page.canonical).length
  findings.push(
    finding(
      'seo-canonical',
      ratioStatus(missingCanonical, pages.length, 0.3),
      'Thẻ canonical đầy đủ',
      'Canonical báo cho Google biết URL "gốc" khi một nội dung truy cập được qua nhiều đường dẫn (tham số UTM, trailing slash…), tránh bị tính là trùng lặp.',
      missingCanonical === 0 ? null : 'Thêm <link rel="canonical"> trỏ về URL chính thức trên mỗi trang.',
      `${pages.length - missingCanonical}/${pages.length} trang có canonical`,
    ),
  )

  const missingViewport = pages.filter((page) => !page.viewportMeta).length
  findings.push(
    finding(
      'seo-mobile-viewport',
      missingViewport === 0 ? 'pass' : 'fail',
      'Thẻ viewport cho di động',
      'Thiếu meta viewport khiến trang không responsive trên di động — Google xếp hạng ưu tiên trải nghiệm di động (mobile-first indexing).',
      missingViewport === 0 ? null : 'Thêm <meta name="viewport" content="width=device-width, initial-scale=1">.',
      `${pages.length - missingViewport}/${pages.length} trang có viewport`,
    ),
  )

  const totalImages = pages.reduce((sum, page) => sum + page.imageCount, 0)
  const missingAlt = pages.reduce((sum, page) => sum + page.imagesMissingAlt, 0)
  findings.push(
    finding(
      'seo-image-alt',
      totalImages === 0 ? 'pass' : ratioStatus(missingAlt, totalImages, 0.2),
      'Ảnh có thuộc tính alt',
      'Alt text giúp Google Images hiểu nội dung ảnh và là yêu cầu khả năng tiếp cận (accessibility) cơ bản.',
      missingAlt === 0 ? null : 'Thêm alt mô tả đúng nội dung cho từng ảnh còn thiếu.',
      totalImages === 0 ? 'Không có ảnh nào trên các trang đã quét' : `${totalImages - missingAlt}/${totalImages} ảnh có alt`,
    ),
  )

  const orphanPages = pages.filter((page) => page.internalLinkCount === 0).length
  findings.push(
    finding(
      'seo-internal-links',
      orphanPages === 0 ? 'pass' : ratioStatus(orphanPages, pages.length, 0.2),
      'Liên kết nội bộ',
      'Trang không có liên kết nội bộ nào trỏ ra ("orphan page") khó được Google thu thập lại và khó điều hướng cho người dùng.',
      orphanPages === 0 ? null : 'Thêm liên kết nội bộ từ các trang khác trỏ tới những trang bị cô lập.',
      `${pages.length - orphanPages}/${pages.length} trang có liên kết nội bộ`,
    ),
  )

  findings.push(
    finding(
      'seo-sitemap',
      crawl.sitemapExists ? 'pass' : 'warn',
      'sitemap.xml tồn tại',
      'Sitemap giúp Google phát hiện và thu thập trang mới nhanh hơn, đặc biệt với site có cấu trúc liên kết phức tạp.',
      crawl.sitemapExists ? null : 'Tạo sitemap.xml liệt kê các URL quan trọng, khai báo trong Google Search Console.',
      crawl.sitemapExists ? `${crawl.sitemapUrlCount} URL trong sitemap` : 'Không tìm thấy /sitemap.xml',
    ),
  )

  findings.push(
    finding(
      'seo-robots-not-blocking',
      crawl.robots.exists && crawl.robots.disallowsAll ? 'fail' : 'pass',
      'robots.txt không chặn toàn bộ site',
      'Một robots.txt chặn "Disallow: /" cho User-agent: * sẽ khiến TOÀN BỘ site biến mất khỏi kết quả tìm kiếm — lỗi nghiêm trọng nhất có thể có.',
      crawl.robots.disallowsAll ? 'Xoá hoặc sửa dòng "Disallow: /" dưới User-agent: * trong robots.txt ngay lập tức.' : null,
      crawl.robots.exists ? (crawl.robots.disallowsAll ? 'robots.txt đang chặn toàn bộ crawler' : 'robots.txt không chặn toàn site') : 'Không có robots.txt (mặc định không chặn gì)',
    ),
  )

  return findings
}
