import 'server-only'

import type { SiteProfile } from '@/lib/domain/audit'
import { realPagesOf, type SiteCrawl } from './crawler'

/**
 * Hồ sơ website — ước tính lĩnh vực/chủ đề từ CHÍNH nội dung đã crawl, không
 * gọi AI nào cả. Đây là NỀN cho tính năng "AI tự phát hiện" sâu hơn sau này
 * (đọc kỹ toàn bộ nội dung, hiểu ngữ cảnh thật) — bản này chỉ khớp từ khoá,
 * minh bạch về độ tin cậy thấp hơn một mô hình AI thật, không giả vờ "biết"
 * nhiều hơn một phép đếm từ cho phép.
 */

const CATEGORY_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  'Thương mại điện tử / Bán lẻ': [
    'shop', 'cửa hàng', 'mua sắm', 'giỏ hàng', 'sản phẩm', 'khuyến mãi', 'ecommerce',
    'store', 'cart', 'checkout', 'shipping', 'đặt hàng', 'giao hàng tận nơi',
  ],
  'Nội thất / Trang trí nhà cửa': [
    'nội thất', 'furniture', 'sofa', 'bàn ghế', 'trang trí nhà', 'decor', 'phòng khách',
    'phòng ngủ', 'giường', 'tủ bếp', 'đèn trang trí',
  ],
  'Nhà hàng / Ẩm thực': [
    'nhà hàng', 'restaurant', 'menu', 'món ăn', 'ẩm thực', 'quán ăn', 'cafe', 'coffee',
    'đặt bàn', 'thực đơn',
  ],
  'Bất động sản': [
    'bất động sản', 'real estate', 'căn hộ', 'chung cư', 'property', 'nhà đất',
    'cho thuê nhà', 'dự án', 'mặt bằng',
  ],
  'Du lịch / Khách sạn': [
    'du lịch', 'travel', 'khách sạn', 'hotel', 'tour', 'resort', 'booking', 'vé máy bay',
    'lữ hành', 'nghỉ dưỡng',
  ],
  'Giáo dục / Đào tạo': [
    'giáo dục', 'education', 'khoá học', 'course', 'trường học', 'university', 'đào tạo',
    'học viện', 'giảng viên', 'học phí',
  ],
  'Y tế / Sức khoẻ': [
    'y tế', 'health', 'bệnh viện', 'clinic', 'phòng khám', 'sức khoẻ', 'medical', 'bác sĩ',
    'điều trị', 'khám bệnh',
  ],
  'Thời trang / Làm đẹp': [
    'thời trang', 'fashion', 'quần áo', 'làm đẹp', 'beauty', 'mỹ phẩm', 'cosmetic', 'spa',
    'trang điểm', 'skincare',
  ],
  'Công nghệ / Phần mềm': [
    'phần mềm', 'software', 'saas', 'ứng dụng', 'platform', 'api', 'cloud', 'technology',
    'developer', 'lập trình',
  ],
  'Sản xuất / Công nghiệp': [
    'sản xuất', 'manufacturing', 'nhà máy', 'factory', 'công nghiệp', 'industrial',
    'xuất khẩu', 'export', 'gia công', 'oem',
  ],
  'Tài chính / Bảo hiểm': [
    'tài chính', 'finance', 'ngân hàng', 'bank', 'bảo hiểm', 'insurance', 'đầu tư',
    'investment', 'vay vốn', 'lãi suất',
  ],
  'Marketing / Truyền thông': [
    'marketing', 'quảng cáo', 'advertising', 'truyền thông', 'media agency', 'branding',
    'social media', 'content marketing',
  ],
  'Dịch vụ chuyên nghiệp': [
    'luật sư', 'lawyer', 'law firm', 'tư vấn', 'consulting', 'kế toán', 'accounting',
    'legal services', 'công chứng',
  ],
  'Logistics / Vận chuyển': [
    'vận chuyển', 'logistics', 'shipping company', 'giao hàng', 'kho bãi', 'warehouse',
    'freight', 'vận tải',
  ],
  'Nông nghiệp / Thực phẩm': [
    'nông nghiệp', 'agriculture', 'thực phẩm', 'nông sản', 'farm', 'trang trại',
    'chế biến thực phẩm',
  ],
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'our', 'are', 'was', 'you',
  'not', 'all', 'have', 'has', 'will', 'can', 'more', 'about', 'home', 'page', 'contact',
  'của', 'và', 'các', 'cho', 'với', 'những', 'là', 'được', 'này', 'trong', 'một', 'có',
  'không', 'để', 'khi', 'đã', 'sẽ', 'từ', 'trên', 'theo', 'về', 'tại', 'chúng', 'tôi',
])

const combinedText = (pages: SiteCrawl['pages']): string =>
  pages
    .flatMap((page) => [
      page.title ?? '',
      page.metaDescription ?? '',
      ...page.headings.map((heading) => heading.text),
    ])
    .join(' ')
    .toLowerCase()

const detectCategory = (
  text: string,
  organizationType: string | null,
): { readonly category: string | null; readonly confidence: SiteProfile['categoryConfidence'] } => {
  let bestCategory: string | null = null
  let bestScore = 0

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter((keyword) => text.includes(keyword)).length
    if (score > bestScore) {
      bestScore = score
      bestCategory = category
    }
  }

  if (bestCategory === null) return { category: null, confidence: null }
  // Schema Organization tồn tại (dù không nói rõ category) vẫn nâng độ tin
  // cậy lên — site TỰ khai mình là một tổ chức thật, không chỉ là văn bản rời rạc.
  const confidence: SiteProfile['categoryConfidence'] =
    bestScore >= 4 ? 'high' : bestScore >= 2 ? 'medium' : organizationType ? 'medium' : 'low'
  return { category: bestCategory, confidence }
}

const extractTopKeywords = (text: string, limit: number): readonly string[] => {
  const counts = new Map<string, number>()
  for (const rawWord of text.split(/[^\p{L}\p{N}]+/u)) {
    const word = rawWord.toLowerCase()
    if (word.length < 4 || STOPWORDS.has(word)) continue
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([word]) => word)
}

export const computeSiteProfile = (crawl: SiteCrawl, fallbackName: string): SiteProfile => {
  const pages = realPagesOf(crawl)
  const homepage = pages.find((page) => page.url === crawl.origin) ?? pages[0] ?? null
  const text = combinedText(pages)
  const { category, confidence } = detectCategory(text, homepage?.organization?.type ?? null)

  return {
    businessName: homepage?.organization?.name ?? fallbackName,
    description: homepage?.organization?.description ?? homepage?.metaDescription ?? null,
    category,
    categoryConfidence: confidence,
    topKeywords: extractTopKeywords(text, 8),
    pagesAnalyzed: pages.length,
    computedAt: new Date().toISOString(),
  }
}
