'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSite } from '@/lib/data/sites'
import { getLatestAuditPageSignals } from '@/lib/data/audit'
import { crawlSite, realPagesOf, type PageSignals, type SiteCrawl } from '@/lib/audit/crawler'
import { evaluateAllRules } from '@/lib/audit/rules'
import { computePageCitability } from '@/lib/audit/citability'
import { computeSiteProfile } from '@/lib/audit/site-profile'
import { applyDetectedMarketOnce } from '@/lib/audit/apply-market'
import { fetchPageSpeedInsights, getConfiguredPageSpeedApiKey } from '@/lib/audit/pagespeed'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'

/**
 * Quét CHẠY NỀN, KHÔNG buộc trình duyệt phải giữ kết nối tới lúc xong. Action
 * này chỉ làm việc NHẸ (xác thực quyền + tạo row `running`) rồi trả kết quả
 * NGAY — việc quét thật (`performAuditScan`, có thể mất vài phút) được giao
 * cho `after()` (Next.js) chạy SAU KHI đã trả response, trong CHÍNH tiến
 * trình server đó, độc lập hoàn toàn với tab trình duyệt đã mở request này.
 * Đóng tab, tải lại trang, hay chuyển sang phần khác của app đều KHÔNG làm
 * gián đoạn — vì không có kết nối HTTP nào của client cần giữ mở nữa.
 *
 * Vẫn có một giới hạn vật lý: `after()` chạy trong đúng ngân sách thời gian
 * mặc định của MỘT lần gọi server-side trên Vercel (Pro: 300s không có Fluid
 * Compute). Site cực lớn/chậm có thể cần quét NỀN xong một lượt (dùng gần hết
 * 300s đó) mà vẫn chưa phủ hết site — khi đó `status` vẫn ghi 'completed'
 * (lượt quét chạy sạch, không lỗi) nhưng `truncated: true`, và UI đổi nhãn
 * nút thành "Quét tiếp" để bấm chạy thêm một lượt nền nữa, dồn tiếp vào phần
 * chưa quét (xem `crawlSite`/`getLatestAuditPageSignals`). Chỉ khi lượt quét
 * bị NGẮT THẬT SỰ giữa chừng (process bị kill, không kịp ghi gì) mới cần tới
 * cơ chế tự nhận "lượt quét bị gián đoạn" ở `data/audit.ts::STALE_RUNNING_THRESHOLD_MS`.
 */
export interface RunAuditState {
  readonly error: string | null
  readonly ok: boolean
}

const INITIAL_STATE: RunAuditState = { error: null, ok: false }

export async function runSiteAuditAction(
  _previous: RunAuditState,
  formData: FormData,
): Promise<RunAuditState> {
  const siteId = formData.get('siteId')
  if (typeof siteId !== 'string' || !siteId) {
    return { ...INITIAL_STATE, error: 'Thiếu website.' }
  }

  const site = await getSite(siteId)
  if (!site) return { ...INITIAL_STATE, error: 'Không tìm thấy website hoặc bạn không có quyền.' }

  const user = await getCurrentUser()
  if (!user) return { ...INITIAL_STATE, error: 'Phiên đăng nhập đã hết hạn.' }

  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: siteId,
    allowed: ['owner', 'admin'],
  })
  if (!isAdmin) {
    return { ...INITIAL_STATE, error: 'Chỉ chủ sở hữu hoặc quản trị viên mới quét được.' }
  }

  // Ghi qua admin client — `audit_runs` không có policy insert/update (giống
  // metrics_daily), vì kết quả quét là dữ liệu do server TÍNH RA, không phải
  // input người dùng gõ trực tiếp.
  const admin = createAdminClient()

  const { data: run, error: insertError } = await admin
    .from('audit_runs')
    .insert({ site_id: siteId, status: 'running', started_by: user.id })
    .select('id')
    .single()

  if (insertError || !run) {
    return { ...INITIAL_STATE, error: `Không tạo được lượt quét: ${insertError?.message}` }
  }

  // Đăng ký việc QUÉT THẬT chạy sau khi response này đã gửi xong — client
  // không đợi, không giữ kết nối. Không dùng `supabase` (client theo phiên
  // người dùng, dựa vào cookie request) bên trong đây — bối cảnh request có
  // thể không còn đáng tin cậy trong `after()`; `performAuditScan` tự dùng
  // admin client cho mọi thao tác đọc/ghi.
  after(() => performAuditScan(siteId, run.id, site.url, site.name))

  revalidatePath(`/${siteId}/audit`)
  return { ok: true, error: null }
}

/**
 * Quét thật — tách riêng khỏi `runSiteAuditAction` vì chạy trong `after()`,
 * không có gì để `return` cho client (client đã nhận response từ lâu). Mọi
 * kết quả/lỗi đều đi thẳng vào `audit_runs`, trang đọc lại khi người dùng
 * quay lại hoặc trình duyệt tự làm mới (xem `AuditRunningPoller`).
 */
const performAuditScan = async (
  siteId: string,
  runId: string,
  siteUrl: string,
  siteName: string,
): Promise<void> => {
  const admin = createAdminClient()

  try {
    const previousPages = await getLatestAuditPageSignals(siteId)
    // URL từng bị chặn bot coi như CHƯA quét thật — ưu tiên quét lại, không
    // đẩy xuống cuối hàng đợi cùng các URL đã có nội dung thật.
    const alreadyCoveredUrls = new Set(
      previousPages.filter((page) => !page.blockedByBotProtection).map((page) => page.url),
    )

    // Báo tiến độ SỐNG trong lúc quét — không có bước này, `pages_scanned`
    // đứng yên ở 0 suốt tới lúc quét xong (chỉ ghi một lần lúc hoàn tất bên
    // dưới), UI "Đang quét nền" sẽ hiện mãi con số 0 dù có tự làm mới trang.
    //
    // GHÉP THEO URL ngay từ đây (không phải cộng dồn bằng phép CỘNG đơn giản
    // "đã có trước + đã quét lượt này") — một lượt "Quét tiếp" hầu như luôn
    // quét LẠI phần lớn URL đã quét ở lượt trước (không chỉ URL mới, xem
    // `crawlSite`), nên cộng thẳng sẽ đếm trùng chính những trang đó: số hiện
    // lên khi đang quét vượt xa tổng thật rồi "tụt" đột ngột về đúng số lúc
    // quét xong — nhìn như đang mất tiến độ dù thực ra không mất gì. Dùng
    // ĐÚNG một cấu trúc ghép (`liveMergedByUrl`) cho cả hiển thị sống lẫn kết
    // quả cuối cùng bên dưới để hai con số không bao giờ lệch nhau.
    const liveMergedByUrl = new Map(previousPages.map((page): [string, PageSignals] => [page.url, page]))

    // Giãn cách bằng thời gian (không ghi mỗi trang) để không dội quá nhiều
    // lượt ghi DB xen giữa lúc đang bận fetch. `await` thật sự (không "bắn
    // rồi quên") — một lượt ghi bị bỏ dở giữa chừng do fire-and-forget là
    // cách dễ nhất khiến số hiện trên UI đứng yên dù lượt quét vẫn đang chạy
    // thật. Bọc try/catch riêng để một lần ghi lỗi (mất mạng tới Supabase
    // thoáng qua…) không làm crash toàn bộ `Promise.all` của worker pool
    // trong `crawlSite`.
    let lastProgressWriteAt = 0
    const PROGRESS_WRITE_INTERVAL_MS = 4_000
    const reportProgress = async (page: PageSignals): Promise<void> => {
      liveMergedByUrl.set(page.url, page)
      const now = Date.now()
      if (now - lastProgressWriteAt < PROGRESS_WRITE_INTERVAL_MS) return
      lastProgressWriteAt = now
      try {
        await admin.from('audit_runs').update({ pages_scanned: liveMergedByUrl.size }).eq('id', runId)
      } catch {
        // Bỏ qua — đây chỉ là tiến độ HIỂN THỊ, không phải kết quả cuối cùng;
        // lượt ghi cuối lúc quét xong (bên dưới) luôn chạy trong try/catch
        // chính, mất một lần cập nhật tiến độ giữa chừng không đáng để hỏng
        // cả lượt quét.
      }
    }

    const crawl = await crawlSite(siteUrl, alreadyCoveredUrls, reportProgress)

    // Ghép cuối cùng dùng LẠI đúng `liveMergedByUrl` đã cập nhật xuyên suốt
    // lượt quét (mọi trang quét được đã `.set()` vào đây trong `reportProgress`
    // ở trên) — không tạo một Map ghép riêng lần hai, tránh hai nơi tính ra
    // hai con số khác nhau.
    const mergedPages = [...liveMergedByUrl.values()]
    const mergedCrawl: SiteCrawl = { ...crawl, pages: mergedPages }

    // Trang bị chặn bot (Cloudflare/WAF) không phải nội dung thật — loại khỏi
    // MỌI phép tính bên dưới (rules, citability, hồ sơ site).
    const realCrawl: SiteCrawl = { ...mergedCrawl, pages: realPagesOf(mergedCrawl) }
    const { findings, seoScore, geoScore, aioScore, aeoScore } = evaluateAllRules(realCrawl)
    const scannedAt = new Date().toISOString()
    const pageCitability = realCrawl.pages.map((page) => computePageCitability(page, siteId, scannedAt))
    const siteProfile = computeSiteProfile(realCrawl, siteName)
    // Key PSI cấu hình chung toàn hệ thống (biến môi trường), không phải mỗi
    // Site tự nhập — chỉ gọi PSI khi máy chủ ĐÃ có key, không âm thầm bỏ qua
    // bằng cách thử gọi thiếu key rồi nuốt lỗi.
    const pagespeedApiKey = getConfiguredPageSpeedApiKey()
    const pagespeed = pagespeedApiKey ? await fetchPageSpeedInsights(crawl.origin, pagespeedApiKey) : null

    await applyDetectedMarketOnce(
      admin,
      siteId,
      new URL(crawl.origin).hostname,
      realCrawl.pages.map((page) => page.lang),
    )

    await admin
      .from('audit_runs')
      .update({
        status: 'completed',
        pages_scanned: mergedPages.length,
        sitemap_url_count: crawl.sitemapUrlCount,
        // Cộng dồn qua nhiều lượt — "còn thiếu" nghĩa là TỔNG đã gộp vẫn chưa
        // phủ hết sitemap, không phải riêng lượt vừa chạy.
        truncated: mergedPages.length < crawl.sitemapUrlCount,
        // Luôn dựa trên lượt quét VỪA XONG — trang chủ luôn được quét lại mỗi
        // lượt (xem crawler.ts), nên tín hiệu này không bao giờ dùng dữ liệu cũ.
        blocked_by_bot_protection: crawl.blockedByBotProtection,
        seo_score: seoScore,
        geo_score: geoScore,
        aio_score: aioScore,
        aeo_score: aeoScore,
        // Các trường jsonb là readonly ở phía TypeScript, cột jsonb ở phía
        // Supabase đòi kiểu có thể mutate — chỉ khác biệt kiểu, không khác
        // giá trị.
        findings: findings as unknown as Json,
        page_citability: pageCitability as unknown as Json,
        page_signals: mergedPages as unknown as Json,
        site_profile: siteProfile as unknown as Json,
        pagespeed: pagespeed as unknown as Json,
        completed_at: scannedAt,
      })
      .eq('id', runId)
  } catch (error) {
    await admin
      .from('audit_runs')
      .update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Lỗi không xác định',
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
  }

  revalidatePath(`/${siteId}/audit`)
}

