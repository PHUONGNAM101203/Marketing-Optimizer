import 'server-only'

import * as cheerio from 'cheerio'
import { XMLParser } from 'fast-xml-parser'

/**
 * Thu thập RAW dữ liệu từ website thật — robots.txt, TOÀN BỘ sitemap.xml
 * (kể cả sitemap index nhiều tầng), và TOÀN BỘ trang khai báo trong sitemap
 * (tới `MAX_PAGES`, chỉ để chặn trường hợp bệnh lý — không cắt giữa chừng
 * một cách vô lý với site thật vài nghìn trang). File này CHỈ lấy dữ liệu
 * thô, không tự quyết "đạt/không đạt" gì cả — đó là việc của `rules/*.ts`,
 * tách riêng để mỗi rule test độc lập được với một `SiteCrawl` giả lập,
 * không cần fetch thật.
 *
 * Chạy trong CHÍNH server action (chưa có hàng đợi job nền), quét theo LÔ
 * (`CONCURRENCY` trang cùng lúc) thay vì bắn hết một lượt — vừa lịch sự với
 * server đích (không dội hàng trăm request đồng thời), vừa giữ tổng thời
 * gian trong ngân sách của một server action.
 *
 * `CRAWL_DEADLINE_MS` là lưới an toàn ĐỘC LẬP với `MAX_PAGES` — dừng quét
 * thêm lô mới khi đã gần hết ngân sách thời gian (Vercel Pro: 300s mặc định,
 * có thể cấu hình cao hơn với Fluid Compute), kể cả khi chưa quét hết
 * `MAX_PAGES`. Không có lưới này, một site vài nghìn trang hoặc server đích
 * phản hồi chậm có thể khiến cả action bị nền tảng hosting cắt ngang giữa
 * chừng — dừng chủ động và báo `truncated: true` còn hơn treo tới lúc bị ép
 * dừng và mất luôn kết quả đã quét được.
 *
 * SITE LỚN (nhiều trăm/nghìn trang, đặc biệt nếu server đích trả lời chậm)
 * KHÔNG quét hết được trong một lượt cho dù tăng ngân sách tới đâu — một
 * request vẫn bị chặn cứng trong khoảng vài phút. Vì vậy `crawlSite` nhận
 * thêm `alreadyCoveredUrls`: tập URL đã quét thành công ở LẦN TRƯỚC, dùng để
 * ưu tiên quét URL CHƯA từng quét trước — mỗi lần bấm "Quét lại" tiến thêm
 * một phần site mới thay vì lặp lại đúng những trang đầu sitemap. Việc GHÉP
 * kết quả cũ + mới thành một tập cộng dồn là việc của nơi gọi
 * (`actions/audit.ts`), file này chỉ quyết THỨ TỰ quét, không tự ghép.
 */

const MAX_PAGES = 5000
const CONCURRENCY = 20
const PAGE_TIMEOUT_MS = 10_000
const MAX_CHILD_SITEMAPS = 50
// Từng là 240_000. Hạ xuống 200s (8/2026) sau khi xác nhận thật crash lặp lại
// cho site nhiều trang (handdn.com, 1182 trang): route audit khai
// `maxDuration = 300` (xem `[siteId]/audit/page.tsx`), nhưng PSI + 3 lượt gọi
// AI gợi ý (từ khoá/prompt mẫu/agent) chỉ bắt đầu SAU KHI crawl xong — hết
// đúng ngân sách 240s cho crawl không còn đủ dư cho phần còn lại (AI đã bọc
// timeout 45s riêng, xem `ai-json.ts`), route bị nền tảng giết cứng giữa
// chừng trước khi kịp ghi lỗi vào DB. 200s + tối đa 45s AI = 245s, còn dư ~55s
// cho phần overhead của chính request/DB write.
const CRAWL_DEADLINE_MS = 200_000
// Liệt kê sitemap chỉ gọi tới `MAX_CHILD_SITEMAPS` request (nhiều nhất vài
// chục), khác hẳn quét hàng nghìn trang — có thể "hào phóng" hơn: timeout
// dài hơn và concurrency thấp hơn hẳn `CONCURRENCY`, vì site chậm dễ bị
// NGHẼN khi nhận nhiều request liệt kê cùng lúc, khiến vài sitemap con
// timeout và bị bỏ qua ÂM THẦM — tổng URL đếm được dao động qua từng lượt dù
// sitemap thật không đổi gì. Thêm một lần thử lại trước khi bỏ cuộc.
const SITEMAP_TIMEOUT_MS = 20_000
const SITEMAP_CONCURRENCY = 8
const USER_AGENT = 'Marketing-Optimizer-Audit/1.0 (+https://github.com)'

/** Cụm từ đặc trưng của trang chặn bot (Cloudflare "Just a moment...", các
 * WAF tương tự) — có trang này nghĩa là chúng ta KHÔNG đọc được nội dung
 * thật, chỉ đọc được lớp chặn. Không phát hiện được thì hệ thống sẽ hiểu
 * nhầm chữ trong trang chặn (vd. "just", "moment") thành nội dung/từ khoá
 * thật của site — đây chính xác là lỗi đã xảy ra với site thật của người
 * dùng. */
const BOT_CHALLENGE_MARKERS = [
  /just a moment/i,
  /checking your browser/i,
  /enable javascript and cookies to continue/i,
  /attention required.*cloudflare/i,
  /verify you are (a )?human/i,
  /__cf_chl_/,
  /cf-turnstile/i,
  /ddos protection by/i,
  /access denied.*perimeterx/i,
]

const isBotChallengePage = (title: string | null, html: string): boolean =>
  BOT_CHALLENGE_MARKERS.some((marker) => marker.test(title ?? '') || marker.test(html))

/** Chạy `items` qua `worker` theo lô tối đa `limit` tác vụ cùng lúc — tránh
 * dội hàng chục/hàng trăm request đồng thời vào server đích. */
const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<readonly R[]> => {
  const results: R[] = []
  for (let start = 0; start < items.length; start += limit) {
    const batch = items.slice(start, start + limit)
    results.push(...(await Promise.all(batch.map(worker))))
  }
  return results
}

export interface RobotsInfo {
  readonly exists: boolean
  readonly disallowsAll: boolean
  /** Chỉ thị cho TỪNG bot AI đọc được từ robots.txt — 'allow' khi có dòng
   * User-agent riêng không Disallow toàn bộ, 'disallow' khi bị chặn rõ ràng,
   * 'unspecified' khi robots.txt không nhắc gì tới bot đó (mặc định Google
   * và hầu hết crawler coi "không nhắc" là được phép). */
  readonly aiBotAccess: Readonly<Record<string, 'allow' | 'disallow' | 'unspecified'>>
  readonly raw: string
}

export interface PageSignals {
  readonly url: string
  readonly status: number
  readonly title: string | null
  readonly metaDescription: string | null
  readonly canonical: string | null
  readonly viewportMeta: boolean
  readonly lang: string | null
  readonly h1Count: number
  readonly headings: readonly { readonly level: number; readonly text: string }[]
  readonly imageCount: number
  readonly imagesMissingAlt: number
  readonly internalLinkCount: number
  readonly externalLinkCount: number
  readonly wordCount: number
  readonly jsonLdTypes: readonly string[]
  /** JSON-LD có khai `dateModified`/`datePublished`, hoặc trang có thẻ
   * `<time>` — tín hiệu độ mới cho điểm citability, không có cách nào khác
   * đọc được "ngày cập nhật" từ HTML thuần một cách đáng tin cậy. */
  readonly hasDateSignal: boolean
  readonly hasListOrTable: boolean
  readonly firstParagraph: string | null
  readonly robotsMetaNoindex: boolean
  /** Khai báo Organization/LocalBusiness qua JSON-LD nếu có — nguồn tin cậy
   * nhất để biết site "là ai/làm gì", hơn hẳn đoán từ văn bản tự do. */
  readonly organization: {
    readonly name: string | null
    readonly description: string | null
    readonly type: string | null
  } | null
  /** `true` khi trang này thực chất là màn hình chặn bot (Cloudflare/WAF),
   * không phải nội dung thật của site — mọi tín hiệu khác của trang này
   * (title, heading, từ khoá…) đều VÔ NGHĨA và không được dùng để suy diễn
   * gì về site. */
  readonly blockedByBotProtection: boolean
}

export interface SiteCrawl {
  readonly origin: string
  readonly robots: RobotsInfo
  readonly sitemapExists: boolean
  readonly sitemapUrlCount: number
  readonly llmsTxtExists: boolean
  readonly pages: readonly PageSignals[]
  /** `true` khi sitemap khai báo nhiều URL hơn `MAX_PAGES` — lượt quét này
   * chỉ là MỘT PHẦN site, không phải toàn bộ. Luôn nói rõ ở UI, không âm
   * thầm hiện kết quả như thể đã quét hết. */
  readonly truncated: boolean
  /** `true` khi TRANG CHỦ bị chặn bởi hệ thống chống bot — nếu ngay cả trang
   * chủ cũng không đọc được nội dung thật, mọi điểm số/hồ sơ suy ra từ lượt
   * quét này đều không đáng tin, phải báo rõ thay vì âm thầm hiện số liệu
   * tính từ nội dung trang chặn. */
  readonly blockedByBotProtection: boolean
}

const AI_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot'] as const

/** Trang bị chặn bot không phải nội dung thật — loại hẳn khỏi MỌI phép suy
 * diễn (rules SEO/GEO/AIO/AEO, citability, site profile), không chỉ một chỗ.
 * Dùng CHUNG một hàm ở đây để không có nơi nào lỡ quên lọc và lại tính điểm
 * từ nội dung màn hình chặn. */
export const realPagesOf = (crawl: SiteCrawl): readonly PageSignals[] =>
  crawl.pages.filter((page) => !page.blockedByBotProtection)

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT },
      redirect: 'follow',
    })
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const parseRobotsTxt = (raw: string): Pick<RobotsInfo, 'disallowsAll' | 'aiBotAccess'> => {
  // Parser tối giản, đủ cho mục đích đọc chỉ thị — không xử lý wildcard phức
  // tạp hay thứ tự ưu tiên chi tiết như Googlebot làm, chỉ đọc "có Disallow: /
  // dưới User-agent: * không" và "có nhắc riêng từng bot AI không".
  const blocks = raw.split(/\n(?=user-agent:)/i)
  const aiBotAccess: Record<string, 'allow' | 'disallow' | 'unspecified'> = {}
  for (const bot of AI_BOTS) aiBotAccess[bot] = 'unspecified'
  let disallowsAll = false

  for (const block of blocks) {
    const agentMatch = block.match(/user-agent:\s*(.+)/i)
    if (!agentMatch) continue
    const agent = agentMatch[1].trim()
    const disallowsRoot = /disallow:\s*\/\s*$/im.test(block)

    if (agent === '*' && disallowsRoot) disallowsAll = true

    const matchedBot = AI_BOTS.find((bot) => bot.toLowerCase() === agent.toLowerCase())
    if (matchedBot) aiBotAccess[matchedBot] = disallowsRoot ? 'disallow' : 'allow'
  }

  return { disallowsAll, aiBotAccess }
}

const fetchRobots = async (origin: string): Promise<RobotsInfo> => {
  const response = await fetchWithTimeout(`${origin}/robots.txt`, PAGE_TIMEOUT_MS)
  if (!response || !response.ok) {
    return {
      exists: false,
      disallowsAll: false,
      aiBotAccess: Object.fromEntries(AI_BOTS.map((bot) => [bot, 'unspecified' as const])),
      raw: '',
    }
  }
  const raw = await response.text()
  return { exists: true, raw, ...parseRobotsTxt(raw) }
}

interface SitemapXml {
  readonly urlset?: { readonly url?: { readonly loc?: string } | readonly { readonly loc?: string }[] }
  readonly sitemapindex?: {
    readonly sitemap?: { readonly loc?: string } | readonly { readonly loc?: string }[]
  }
}

/** Thử lại MỘT lần trước khi coi một sitemap con là không đọc được — site
 * chậm dễ khiến một request đơn lẻ timeout ngẫu nhiên dù bản thân file vẫn
 * tồn tại và hợp lệ; không thử lại sẽ khiến tổng URL đếm được dao động qua
 * từng lượt quét dù sitemap thật không hề đổi. */
const fetchAndParseXml = async (url: string, attempt = 1): Promise<SitemapXml | null> => {
  const response = await fetchWithTimeout(url, SITEMAP_TIMEOUT_MS)
  if (!response || !response.ok) {
    return attempt < 2 ? fetchAndParseXml(url, attempt + 1) : null
  }
  try {
    return new XMLParser().parse(await response.text()) as SitemapXml
  } catch {
    return attempt < 2 ? fetchAndParseXml(url, attempt + 1) : null
  }
}

/** Đọc `sitemap.xml` ở gốc — theo HẾT sitemap index nhiều tầng (tới
 * `MAX_CHILD_SITEMAPS` sitemap con, đủ cho tuyệt đại đa số site thật), không
 * chỉ đọc sitemap con đầu tiên. Site rất lớn (hàng chục nghìn URL) vẫn có
 * thể vượt `MAX_PAGES` ở bước lọc sau — đây chỉ là bước LIỆT KÊ toàn bộ URL
 * sitemap khai báo, chưa phải bước quyết định quét bao nhiêu trang. */
const fetchSitemapUrls = async (origin: string): Promise<readonly string[]> => {
  const root = await fetchAndParseXml(`${origin}/sitemap.xml`)
  if (!root) return []

  const directUrls = toArray(root.urlset?.url)
    .map((entry) => entry.loc)
    .filter((loc): loc is string => Boolean(loc))
  if (directUrls.length > 0) return directUrls

  const childSitemaps = toArray(root.sitemapindex?.sitemap)
    .map((entry) => entry.loc)
    .filter((loc): loc is string => Boolean(loc))
    .slice(0, MAX_CHILD_SITEMAPS)
  if (childSitemaps.length === 0) return []

  const childUrlLists = await mapWithConcurrency(childSitemaps, SITEMAP_CONCURRENCY, async (sitemapUrl) => {
    const child = await fetchAndParseXml(sitemapUrl)
    if (!child) return []
    return toArray(child.urlset?.url)
      .map((entry) => entry.loc)
      .filter((loc): loc is string => Boolean(loc))
  })

  return childUrlLists.flat()
}

const toArray = <T,>(value: T | readonly T[] | undefined): readonly T[] => {
  if (value === undefined) return []
  return Array.isArray(value) ? (value as readonly T[]) : [value as T]
}

const parsePage = (url: string, status: number, html: string, origin: string): PageSignals => {
  const $ = cheerio.load(html)

  const headings = $('h1, h2, h3, h4, h5, h6')
    .map((_index, el) => ({
      level: Number(el.tagName.slice(1)),
      text: $(el).text().trim(),
    }))
    .get()
    .filter((heading) => heading.text.length > 0)

  const images = $('img')
  const imagesMissingAlt = images.filter((_index, el) => !$(el).attr('alt')?.trim()).length

  let internalLinkCount = 0
  let externalLinkCount = 0
  $('a[href]').each((_index, el) => {
    const href = $(el).attr('href') ?? ''
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
    try {
      const resolved = new URL(href, url)
      if (resolved.origin === origin) internalLinkCount += 1
      else externalLinkCount += 1
    } catch {
      // href không parse được (javascript:, dữ liệu hỏng...) — bỏ qua.
    }
  })

  const jsonLdTypes: string[] = []
  let jsonLdHasDate = false
  let organization: PageSignals['organization'] = null
  const ORG_TYPES = new Set(['Organization', 'LocalBusiness', 'Corporation', 'Store'])
  $('script[type="application/ld+json"]').each((_index, el) => {
    try {
      const parsed: unknown = JSON.parse($(el).text())
      const entries = Array.isArray(parsed) ? parsed : [parsed]
      for (const entry of entries) {
        const record = entry as Record<string, unknown>
        const type = record?.['@type'] as string | readonly string[] | undefined
        if (typeof type === 'string') jsonLdTypes.push(type)
        else if (Array.isArray(type)) jsonLdTypes.push(...type)
        if (record?.dateModified || record?.datePublished) jsonLdHasDate = true

        const typeList = typeof type === 'string' ? [type] : (type ?? [])
        if (!organization && typeList.some((t) => ORG_TYPES.has(t))) {
          organization = {
            name: typeof record.name === 'string' ? record.name : null,
            description: typeof record.description === 'string' ? record.description : null,
            type: typeList[0] ?? null,
          }
        }
      }
    } catch {
      // JSON-LD hỏng cú pháp — không tính là có schema hợp lệ, bỏ qua thay vì crash.
    }
  })

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
  const firstParagraph = $('p').first().text().trim().slice(0, 240) || null

  return {
    url,
    status,
    title: $('title').first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr('content')?.trim() || null,
    canonical: $('link[rel="canonical"]').attr('href') || null,
    viewportMeta: $('meta[name="viewport"]').length > 0,
    lang: $('html').attr('lang') || null,
    h1Count: $('h1').length,
    headings,
    imageCount: images.length,
    imagesMissingAlt,
    internalLinkCount,
    externalLinkCount,
    wordCount: bodyText.length > 0 ? bodyText.split(' ').length : 0,
    jsonLdTypes,
    hasDateSignal: jsonLdHasDate || $('time').length > 0,
    hasListOrTable: $('ul, ol, table').length > 0,
    firstParagraph,
    robotsMetaNoindex: /noindex/i.test($('meta[name="robots"]').attr('content') ?? ''),
    organization,
    blockedByBotProtection: isBotChallengePage($('title').first().text().trim() || null, html),
  }
}

export const crawlSite = async (
  siteUrl: string,
  alreadyCoveredUrls?: ReadonlySet<string>,
  /** Gọi lại mỗi khi quét thêm được một trang, kèm CHÍNH trang đó — nơi gọi
   * tự quyết định có ghi xuống DB hay không (và giãn cách bao lâu); file này
   * không biết gì về lưu trữ, chỉ báo tiến độ thô. Truyền cả `PageSignals`
   * (không chỉ một con số đếm) để nơi gọi tự GHÉP theo URL giống hệt cách
   * ghép cuối cùng ở `actions/audit.ts` — một lượt "Quét tiếp" gần như luôn
   * quét LẠI phần lớn URL đã quét trước đó (không chỉ URL mới), nên cộng dồn
   * bằng phép CỘNG đơn thuần (`đã có trước + đã quét lượt này`) đếm trùng
   * ngay chính những trang vừa quét lại — số hiện lên khi đang chạy có thể
   * vượt xa tổng thật, rồi "tụt" đột ngột về đúng số khi quét xong, rất khó
   * hiểu. ĐƯỢC `await` trong worker loop bên dưới — đảm bảo lượt ghi DB (nếu
   * có) thực sự hoàn tất thay vì "bắn rồi quên" (fire-and-forget dễ bị môi
   * trường serverless treo/hủy ngầm khi request gốc đã coi như xong việc, dù
   * `after()` vẫn đang chạy). */
  onPageScanned?: (page: PageSignals) => void | Promise<void>,
): Promise<SiteCrawl> => {
  const origin = new URL(siteUrl).origin

  const [robots, sitemapUrls, llmsResponse] = await Promise.all([
    fetchRobots(origin),
    fetchSitemapUrls(origin),
    fetchWithTimeout(`${origin}/llms.txt`, PAGE_TIMEOUT_MS),
  ])

  // Trang cần quét: luôn có homepage, cộng thêm URL từ sitemap tới khi đủ
  // ngân sách — homepage đứng đầu để không bao giờ bị cắt mất (kể cả khi đã
  // quét trước đó, luôn quét LẠI để tín hiệu "bị chặn bot"/hồ sơ site luôn
  // dựa trên lần đọc mới nhất, không dùng dữ liệu cũ có thể đã lỗi thời).
  const candidateUrls = [origin, ...sitemapUrls.filter((url) => url !== origin && url !== `${origin}/`)]
  const uniqueCandidates = [...new Set(candidateUrls)]

  // Ưu tiên URL CHƯA quét lần nào lên đầu — site lớn quét dần qua nhiều lượt
  // "Quét lại" thay vì lượt nào cũng dừng đúng chỗ cũ vì hết giờ trước khi
  // chạm tới phần site chưa từng thấy.
  const prioritized = alreadyCoveredUrls
    ? [
        ...uniqueCandidates.filter((url) => url === origin || !alreadyCoveredUrls.has(url)),
        ...uniqueCandidates.filter((url) => url !== origin && alreadyCoveredUrls.has(url)),
      ]
    : uniqueCandidates
  const targetUrls = prioritized.slice(0, MAX_PAGES)

  // Thử lại MỘT lần khi request timeout/lỗi mạng (response === null) — CÙNG
  // lý do đã áp dụng cho sitemap (`fetchAndParseXml`): server chậm dễ khiến
  // một request đơn lẻ timeout ngẫu nhiên dù trang vẫn truy cập được bình
  // thường. Không thử lại thì một lần trục trặc thoáng qua để lại đúng MỘT
  // trang "mất tích" vĩnh viễn — trang đó chưa từng vào `pages` nên cũng
  // không nằm trong `alreadyCoveredUrls` của lượt sau, nhưng vẫn buộc người
  // dùng phải tự bấm "Quét tiếp" thêm một lần chỉ để lấy một trang duy nhất.
  // KHÔNG thử lại khi server trả lời có status (404/500…) — đó là câu trả lời
  // thật, không phải lỗi mạng.
  const fetchPage = async (url: string, attempt = 1): Promise<PageSignals | null> => {
    const response = await fetchWithTimeout(url, PAGE_TIMEOUT_MS)
    if (!response) return attempt < 2 ? fetchPage(url, attempt + 1) : null
    const html = await response.text()
    return parsePage(url, response.status, html, origin)
  }

  // Hàng đợi kiểu "worker rảnh lấy việc kế tiếp" — KHÔNG chia lô cố định.
  // Chia lô cố định (đợi Promise.all của CẢ lô xong mới bắt đầu lô sau) có
  // một lỗ hổng hiệu năng nghiêm trọng với site có độ trễ không đều: một
  // request chậm/gần chạm timeout trong lô kéo TOÀN BỘ lô đó xuống tốc độ
  // của chính nó, dù 19/20 worker còn lại đã xong từ lâu và phải ngồi chờ
  // không làm gì — càng tăng CONCURRENCY càng dễ dính request chậm trong mỗi
  // lô, nên tăng concurrency có khi làm CHẬM ĐI thay vì nhanh lên (đúng hiện
  // tượng quan sát được: 10→20 concurrency mà số trang mới quét mỗi lượt lại
  // giảm). Hàng đợi này để mỗi worker độc lập, xong việc là lấy ngay URL tiếp
  // theo — không ai phải chờ ai.
  const startedAt = Date.now()
  const pages: PageSignals[] = []
  let attempted = 0
  let nextIndex = 0

  const worker = async (): Promise<void> => {
    while (true) {
      if (Date.now() - startedAt > CRAWL_DEADLINE_MS) return
      const index = nextIndex
      nextIndex += 1
      if (index >= targetUrls.length) return
      attempted += 1
      const result = await fetchPage(targetUrls[index])
      if (result) {
        pages.push(result)
        await onPageScanned?.(result)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  const homepage = pages.find((page) => page.url === origin) ?? null

  return {
    origin,
    robots,
    sitemapExists: sitemapUrls.length > 0,
    // ĐẾM TRÊN `uniqueCandidates` (đã khử trùng lặp + luôn tính đúng 1 lần
    // cho homepage), KHÔNG dùng `sitemapUrls.length` (số dòng <url> THÔ đọc
    // thẳng từ XML) — sitemap thật không hiếm khi liệt kê trùng một URL (vd.
    // khai hreflang cho nhiều ngôn ngữ cùng trỏ 1 `loc`, hoặc tự khai lại
    // chính homepage). Dùng số thô làm mẫu số trong khi tử số (`pages`) đã
    // khử trùng lặp theo URL khiến tỉ lệ "X/Y" KHÔNG BAO GIỜ đạt 100% dù đã
    // quét hết mọi URL thật sự tồn tại — đúng lỗi "306/307 mãi mãi" quan sát
    // được dù quét lại bao nhiêu lần.
    sitemapUrlCount: uniqueCandidates.length,
    llmsTxtExists: Boolean(llmsResponse?.ok),
    pages,
    truncated: uniqueCandidates.length > attempted,
    blockedByBotProtection: homepage?.blockedByBotProtection ?? false,
  }
}
