/**
 * Đoán thị trường mục tiêu của một site (đơn vị tiền + múi giờ) từ hai tín
 * hiệu THẬT đã có sẵn, không quét thêm gì mới:
 *   · Tên miền (`site.domain`) — ccTLD gần như không mơ hồ (.dk gần chắc chắn
 *     là Đan Mạch).
 *   · Thuộc tính `lang` đọc được từ HTML mỗi trang đã crawl (`PageSignals.lang`,
 *     xem `crawler.ts`) — chỉ dùng cho các ngôn ngữ KHÔNG mơ hồ (tiếng Việt
 *     hầu như chỉ Việt Nam dùng). CỐ TÌNH bỏ qua các ngôn ngữ nói ở nhiều
 *     nước có tiền tệ khác nhau (en, es, fr, pt, ar, zh…) — đoán bừa cho
 *     nhóm này tệ hơn không đoán gì cả.
 *
 * Kết quả chỉ là GỢI Ý có gắn độ tin cậy — không bao giờ tự nhận là chắc
 * chắn. Nơi gọi (`audit/apply-market.ts`) chỉ tự ÁP DỤNG khi site còn ở giá
 * trị mặc định lúc tạo (chưa ai chỉnh tay), không bao giờ ghi đè lựa chọn
 * thật của người dùng.
 *
 * KHÔNG đánh dấu `server-only` — bảng `TLD_MARKET` (`COUNTRY_OPTIONS`) được
 * import cả ở component client (`edit-site-form.tsx`, dropdown "Quốc gia")
 * lẫn ở server (`apply-market.ts`, `actions/site.ts`). File này thuần dữ
 * liệu + hàm thuần, không đụng secret hay API nào chỉ chạy được trên server.
 */

export interface MarketDetection {
  readonly countryCode: string
  readonly currency: string
  readonly timezone: string
  readonly countryLabel: string
  readonly confidence: 'high' | 'medium'
  readonly basis: string
}

interface MarketEntry {
  readonly currency: string
  readonly timezone: string
  readonly countryLabel: string
}

/** ccTLD → thị trường. Chỉ liệt kê các mã có tiền tệ/múi giờ rõ ràng. Cũng
 * đóng vai trò bảng "Quốc gia" cho dropdown chỉnh tay (`COUNTRY_OPTIONS`
 * bên dưới) — CÙNG MỘT nguồn sự thật cho cả tự phát hiện lẫn chọn tay, không
 * có chuyện hai nơi tính ra hai kết quả khác nhau cho cùng một quốc gia. */
export const TLD_MARKET: Readonly<Record<string, MarketEntry>> = {
  vn: { currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', countryLabel: 'Việt Nam' },
  dk: { currency: 'DKK', timezone: 'Europe/Copenhagen', countryLabel: 'Đan Mạch' },
  de: { currency: 'EUR', timezone: 'Europe/Berlin', countryLabel: 'Đức' },
  jp: { currency: 'JPY', timezone: 'Asia/Tokyo', countryLabel: 'Nhật Bản' },
  kr: { currency: 'KRW', timezone: 'Asia/Seoul', countryLabel: 'Hàn Quốc' },
  th: { currency: 'THB', timezone: 'Asia/Bangkok', countryLabel: 'Thái Lan' },
  id: { currency: 'IDR', timezone: 'Asia/Jakarta', countryLabel: 'Indonesia' },
  my: { currency: 'MYR', timezone: 'Asia/Kuala_Lumpur', countryLabel: 'Malaysia' },
  sg: { currency: 'SGD', timezone: 'Asia/Singapore', countryLabel: 'Singapore' },
  uk: { currency: 'GBP', timezone: 'Europe/London', countryLabel: 'Anh' },
  fr: { currency: 'EUR', timezone: 'Europe/Paris', countryLabel: 'Pháp' },
  es: { currency: 'EUR', timezone: 'Europe/Madrid', countryLabel: 'Tây Ban Nha' },
  it: { currency: 'EUR', timezone: 'Europe/Rome', countryLabel: 'Ý' },
  nl: { currency: 'EUR', timezone: 'Europe/Amsterdam', countryLabel: 'Hà Lan' },
  se: { currency: 'SEK', timezone: 'Europe/Stockholm', countryLabel: 'Thuỵ Điển' },
  no: { currency: 'NOK', timezone: 'Europe/Oslo', countryLabel: 'Na Uy' },
  fi: { currency: 'EUR', timezone: 'Europe/Helsinki', countryLabel: 'Phần Lan' },
  pl: { currency: 'PLN', timezone: 'Europe/Warsaw', countryLabel: 'Ba Lan' },
  ru: { currency: 'RUB', timezone: 'Europe/Moscow', countryLabel: 'Nga' },
  cn: { currency: 'CNY', timezone: 'Asia/Shanghai', countryLabel: 'Trung Quốc' },
  hk: { currency: 'HKD', timezone: 'Asia/Hong_Kong', countryLabel: 'Hồng Kông' },
  tw: { currency: 'TWD', timezone: 'Asia/Taipei', countryLabel: 'Đài Loan' },
  in: { currency: 'INR', timezone: 'Asia/Kolkata', countryLabel: 'Ấn Độ' },
  au: { currency: 'AUD', timezone: 'Australia/Sydney', countryLabel: 'Úc' },
  nz: { currency: 'NZD', timezone: 'Pacific/Auckland', countryLabel: 'New Zealand' },
  ca: { currency: 'CAD', timezone: 'America/Toronto', countryLabel: 'Canada' },
  us: { currency: 'USD', timezone: 'America/New_York', countryLabel: 'Mỹ' },
  br: { currency: 'BRL', timezone: 'America/Sao_Paulo', countryLabel: 'Brazil' },
  mx: { currency: 'MXN', timezone: 'America/Mexico_City', countryLabel: 'Mexico' },
  ph: { currency: 'PHP', timezone: 'Asia/Manila', countryLabel: 'Philippines' },
  tr: { currency: 'TRY', timezone: 'Europe/Istanbul', countryLabel: 'Thổ Nhĩ Kỳ' },
  ae: { currency: 'AED', timezone: 'Asia/Dubai', countryLabel: 'UAE' },
  sa: { currency: 'SAR', timezone: 'Asia/Riyadh', countryLabel: 'Ả Rập Xê Út' },
  za: { currency: 'ZAR', timezone: 'Africa/Johannesburg', countryLabel: 'Nam Phi' },
  ch: { currency: 'CHF', timezone: 'Europe/Zurich', countryLabel: 'Thuỵ Sĩ' },
  at: { currency: 'EUR', timezone: 'Europe/Vienna', countryLabel: 'Áo' },
  be: { currency: 'EUR', timezone: 'Europe/Brussels', countryLabel: 'Bỉ' },
  pt: { currency: 'EUR', timezone: 'Europe/Lisbon', countryLabel: 'Bồ Đào Nha' },
  gr: { currency: 'EUR', timezone: 'Europe/Athens', countryLabel: 'Hy Lạp' },
  cz: { currency: 'CZK', timezone: 'Europe/Prague', countryLabel: 'Séc' },
  hu: { currency: 'HUF', timezone: 'Europe/Budapest', countryLabel: 'Hungary' },
  ro: { currency: 'RON', timezone: 'Europe/Bucharest', countryLabel: 'Romania' },
}

/** Domain phụ dạng `.co.uk`/`.com.au`… → ánh xạ về đúng mã quốc gia thật
 * (đoạn cuối `uk`/`au`…), không phải đoạn `co`/`com` đứng trước nó. */
const COMPOUND_SUFFIXES: Readonly<Record<string, string>> = {
  'co.uk': 'uk',
  'com.au': 'au',
  'com.br': 'br',
  'com.vn': 'vn',
  'com.sg': 'sg',
  'co.id': 'id',
  'co.th': 'th',
  'co.jp': 'jp',
  'co.kr': 'kr',
  'co.nz': 'nz',
}

/** Ngôn ngữ trang → thị trường. CHỈ các ngôn ngữ thực tế gắn với một nước chủ
 * đạo — không đưa en/es/fr/pt/ar/zh vào đây (xem lý do ở docblock trên). */
const LANG_MARKET: Readonly<Record<string, MarketEntry>> = {
  vi: TLD_MARKET.vn,
  da: TLD_MARKET.dk,
  ja: TLD_MARKET.jp,
  ko: TLD_MARKET.kr,
  th: TLD_MARKET.th,
  pl: TLD_MARKET.pl,
  sv: TLD_MARKET.se,
  nb: TLD_MARKET.no,
  nn: TLD_MARKET.no,
  fi: TLD_MARKET.fi,
  cs: TLD_MARKET.cz,
  hu: TLD_MARKET.hu,
  ro: TLD_MARKET.ro,
  el: TLD_MARKET.gr,
  tr: TLD_MARKET.tr,
  id: TLD_MARKET.id,
  ms: TLD_MARKET.my,
  hi: TLD_MARKET.in,
  nl: TLD_MARKET.nl,
}

const extractTld = (domain: string): string | null => {
  const clean = domain.toLowerCase().replace(/^www\./, '')
  for (const [suffix, country] of Object.entries(COMPOUND_SUFFIXES)) {
    if (clean.endsWith(`.${suffix}`)) return country
  }
  const last = clean.split('.').pop()
  return last ?? null
}

const normalizeLang = (lang: string): string => lang.trim().toLowerCase().split(/[-_]/)[0] ?? ''

/** Ngôn ngữ xuất hiện nhiều nhất trong các trang đã quét — một site có thể có
 * vài trang tiếng Anh xen kẽ (footer đa ngôn ngữ…), lấy ngôn ngữ CHIẾM ĐA SỐ
 * mới đáng tin, không lấy trang đầu tiên gặp được. */
const dominantLanguage = (pageLanguages: readonly (string | null)[]): string | null => {
  const counts = new Map<string, number>()
  for (const raw of pageLanguages) {
    if (!raw) continue
    const lang = normalizeLang(raw)
    if (!lang) continue
    counts.set(lang, (counts.get(lang) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      best = lang
      bestCount = count
    }
  }
  return best
}

/** Dò ngược mã quốc gia từ một `MarketEntry` — dùng khi chỉ có tín hiệu ngôn
 * ngữ (không có ccTLD), vì `LANG_MARKET` trỏ THẲNG tới object trong
 * `TLD_MARKET` (vd. `vi: TLD_MARKET.vn`) nên so sánh tham chiếu là đủ. */
const findCountryCode = (entry: MarketEntry): string | undefined =>
  Object.entries(TLD_MARKET).find(([, candidate]) => candidate === entry)?.[0]

export const detectMarket = (
  domain: string,
  pageLanguages: readonly (string | null)[],
): MarketDetection | null => {
  const tld = extractTld(domain)
  const tldEntry = tld ? TLD_MARKET[tld] : undefined
  const lang = dominantLanguage(pageLanguages)
  const langEntry = lang ? LANG_MARKET[lang] : undefined

  // ccTLD MỘT MÌNH đã đủ 'high' — đúng như docblock đầu file: ".dk gần chắc
  // chắn là Đan Mạch". Trước đây hàm này đòi cả lang PHẢI khớp mới cho 'high',
  // nhưng rất nhiều site (đặc biệt site Shopify/theme quốc tế) để `<html
  // lang="en">` mặc định bất kể nội dung thật — khiến điều kiện "cả hai khớp"
  // gần như không bao giờ đạt, và tên miền .dk/.de/... không bao giờ được tự
  // áp dụng dù tín hiệu ccTLD của nó vốn đã đủ mạnh một mình.
  if (tldEntry && langEntry && tldEntry.currency === langEntry.currency && tld) {
    return { ...tldEntry, countryCode: tld, confidence: 'high', basis: `tên miền .${tld} + ngôn ngữ trang "${lang}"` }
  }
  if (tldEntry && tld) {
    return { ...tldEntry, countryCode: tld, confidence: 'high', basis: `tên miền .${tld}` }
  }
  if (langEntry && lang) {
    const countryCode = findCountryCode(langEntry)
    if (countryCode) {
      return { ...langEntry, countryCode, confidence: 'medium', basis: `ngôn ngữ trang chủ yếu "${lang}"` }
    }
  }
  return null
}

/** Danh sách quốc gia cho dropdown chỉnh tay ở "Sửa thông tin website" —
 * cùng nguồn `TLD_MARKET` dùng để tự phát hiện, sắp theo tên tiếng Việt. */
export const COUNTRY_OPTIONS: readonly { readonly code: string; readonly label: string }[] = Object.entries(
  TLD_MARKET,
)
  .map(([code, entry]) => ({ code, label: entry.countryLabel }))
  .sort((a, b) => a.label.localeCompare(b.label, 'vi'))

