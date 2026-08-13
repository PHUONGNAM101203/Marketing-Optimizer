import 'server-only'

import type { Site } from '@/lib/domain/site'
import type { SiteCrawl } from './crawler'

/**
 * Sinh nội dung `llms.txt` theo quy ước không chính thức của llmstxt.org —
 * H1 tên site, blockquote mô tả ngắn, danh sách link Markdown tới các trang
 * quan trọng. App này KHÔNG có quyền ghi vào server web của người dùng
 * (đúng triết lý "chỉ đọc" xuyên suốt cả app) — chỉ sinh NỘI DUNG, người dùng
 * tự tải lên `{domain}/llms.txt`.
 */
export const generateLlmsTxtContent = (site: Site, crawl: SiteCrawl): string => {
  const homepage = crawl.pages.find((page) => page.url === crawl.origin) ?? crawl.pages[0] ?? null
  const description = homepage?.metaDescription ?? null

  const lines: string[] = [`# ${site.name}`, '']
  if (description) lines.push(`> ${description}`, '')

  lines.push('## Trang chính', '')
  for (const page of crawl.pages) {
    // Trang tự khai noindex thì không đáng đưa vào bản kê khai cho agent đọc.
    if (page.robotsMetaNoindex) continue
    const title = page.title ?? page.url
    lines.push(`- [${title}](${page.url})`)
  }

  return lines.join('\n')
}
