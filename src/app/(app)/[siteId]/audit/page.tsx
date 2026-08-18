import { notFound } from 'next/navigation'
import { Loader2, TriangleAlert } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { OverviewTabs } from '@/components/overview/overview-tabs'
import { RunAuditButton } from '@/components/audit/run-audit-button'
import { AuditCategoryPanel } from '@/components/audit/audit-category-panel'
import { BotProtectionGuide } from '@/components/audit/bot-protection-guide'
import { AuditRunningPoller } from '@/components/audit/audit-running-poller'
import { getSite } from '@/lib/data/sites'
import { getLatestAuditRun } from '@/lib/data/audit'
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_LABELS, findingsOf, scoreOf } from '@/lib/domain/audit'
import { formatRelativeTime } from '@/lib/format'

export const metadata = { title: 'Kiểm tra SEO/GEO/AIO/AEO' }

// `runSiteAuditAction` (Server Action gọi từ trang này) chạy `performAuditScan`
// trong `after()` — quét thật (crawl tới `CRAWL_DEADLINE_MS`) + PSI + gợi ý AI
// có thể mất tới vài phút cho site nhiều trang (xác nhận thật: handdn.com
// 1182 trang mất ~238s, 8/2026). Không khai báo `maxDuration` thì Next.js áp
// giới hạn MẶC ĐỊNH của Vercel cho route này — không đủ. Khai theo đúng trần
// Fluid Compute trên Hobby (xem `api/cron/sync-all/route.ts`, cùng lý do).
export const maxDuration = 300

export default async function AuditPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>
}) {
  const { siteId } = await params
  const site = await getSite(siteId)
  if (!site) notFound()

  const run = await getLatestAuditRun(site.id)
  const isRunning = run?.status === 'running'

  return (
    <PageShell>
      <AuditRunningPoller isRunning={isRunning} />

      <PageHeader
        title="Kiểm tra SEO/GEO/AIO/AEO"
        description="Quét kỹ thuật toàn site — nền tảng cho công cụ tìm kiếm truyền thống (SEO), cho AI trích xuất khi tổng hợp câu trả lời (GEO), cho AI Overviews (AIO), và cho nội dung được trích làm câu trả lời trực tiếp (AEO)."
        action={<RunAuditButton siteId={site.id} status={run?.status ?? null} truncated={run?.truncated ?? false} />}
        meta={
          run ? (
            <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
              {isRunning
                ? `Đang quét nền · đã đọc ${run.pagesScanned} trang`
                : `Quét ${formatRelativeTime(run.startedAt, new Date())} · ${run.pagesScanned}${run.truncated ? `/${run.sitemapUrlCount}` : ''} trang đã quét`}
            </p>
          ) : null
        }
      />

      {run?.blockedByBotProtection ? (
        <Callout
          tone="critical"
          icon={<TriangleAlert aria-hidden className="size-5 text-[var(--color-negative)]" />}
          title="Trang chủ bị hệ thống chống bot chặn"
        >
          <p className="mb-2">
            {site.domain} có bật hệ thống chống bot (kiểu Cloudflare &quot;Just a
            moment...&quot;) — lượt quét này chỉ đọc được màn hình chặn, không phải
            nội dung thật. Điểm số và hồ sơ bên dưới <strong>không đáng tin</strong>.
            Cần cho phép crawler của chúng tôi truy cập rồi quét lại.
          </p>
          <BotProtectionGuide />
        </Callout>
      ) : null}

      {run?.truncated && !isRunning ? (
        <Callout
          tone="signal"
          icon={<TriangleAlert aria-hidden className="size-5 text-[var(--color-signal)]" />}
          title="Chỉ quét được một phần site"
        >
          <p>
            Sitemap khai báo {run.sitemapUrlCount} URL, tổng cộng dồn qua các lượt quét mới đọc
            được {run.pagesScanned} trang — điểm số dưới đây tính trên phần đã quét, không phải
            toàn site. Một lượt quét nền có giới hạn thời gian nên site rất lớn/chậm không xong
            hết trong một lượt được; bấm &quot;Quét tiếp&quot; — chạy nền tiếp tục quét phần CHƯA
            từng quét, không lặp lại từ đầu, tới khi phủ hết site.
          </p>
        </Callout>
      ) : null}

      {run?.status === 'failed' ? (
        <Callout
          tone="critical"
          icon={<TriangleAlert aria-hidden className="size-5 text-[var(--color-negative)]" />}
          title="Lượt quét gần nhất thất bại"
        >
          <p>{run.error ?? 'Có lỗi xảy ra. Vui lòng thử quét lại.'}</p>
        </Callout>
      ) : null}

      {!run ? (
        <EmptyState
          title="Chưa quét lần nào"
          description={`Bấm "Quét toàn site" ở trên để kiểm tra ${site.domain} — chạy nền, không cần giữ trang này mở. Site vài trăm/nghìn trang có thể cần bấm "Quét tiếp" thêm vài lần, mỗi lần cộng dồn thêm phần chưa quét tới khi phủ hết site.`}
        />
      ) : isRunning ? (
        <EmptyState
          icon={<Loader2 aria-hidden className="size-6 animate-spin" />}
          title="Đang quét nền…"
          description={`Đã đọc được ${run.pagesScanned} trang. Bạn có thể rời trang này hoặc tải lại — lượt quét vẫn tiếp tục chạy trên máy chủ, không bị gián đoạn. Trang này tự cập nhật khi có tiến triển.`}
        />
      ) : run.findings.length === 0 ? (
        <EmptyState
          title="Không lấy được dữ liệu"
          description="Lượt quét không đọc được trang nào — kiểm tra domain có truy cập công khai được không rồi quét lại."
        />
      ) : (
        <OverviewTabs
          tabs={AUDIT_CATEGORIES.map((category) => ({
            id: category,
            label: `${AUDIT_CATEGORY_LABELS[category]} · ${scoreOf(run, category) ?? '—'}`,
          }))}
          panels={AUDIT_CATEGORIES.map((category) => (
            <AuditCategoryPanel
              key={category}
              category={category}
              score={scoreOf(run, category)}
              findings={findingsOf(run, category)}
              pagespeed={run.pagespeed}
              pageUrl={site.url}
            />
          ))}
        />
      )}
    </PageShell>
  )
}
