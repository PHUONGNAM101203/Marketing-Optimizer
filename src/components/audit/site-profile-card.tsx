import Link from 'next/link'
import { ArrowRight, ShieldAlert, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BotProtectionGuide } from '@/components/audit/bot-protection-guide'
import type { AuditRunSummary } from '@/lib/domain/audit'

/* Hallmark · component: site-profile-card · theme: studied-DNA (Ink & Signal)
 *
 * "Hồ sơ website" — lĩnh vực/chủ đề ước tính TỪ CHÍNH nội dung đã quét, không
 * bịa. Đây là nền cho tính năng "AI tự phát hiện" sâu hơn sau này (đọc hiểu
 * ngữ cảnh thật thay vì khớp từ khoá) — nói rõ đây là ước tính bằng huy hiệu
 * độ tin cậy, không giả vờ chắc chắn hơn một phép khớp từ cho phép.
 *
 * Tốc độ tải trang (PageSpeed) KHÔNG nằm ở đây nữa — có component riêng
 * `PageSpeedReport` bám sát giao diện PageSpeed Insights thật, ghép cạnh
 * thẻ này ở mọi nơi cần hiện cả hai.
 */

const CONFIDENCE_LABELS: Readonly<Record<'high' | 'medium' | 'low', string>> = {
  high: 'Độ tin cậy cao — từ schema.org site tự khai',
  medium: 'Độ tin cậy trung bình — suy từ nội dung',
  low: 'Độ tin cậy thấp — ước tính sơ bộ',
}

export function SiteProfileCard({ siteId, run }: { readonly siteId: string; readonly run: AuditRunSummary | null }) {
  if (!run || !run.siteProfile) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--color-signal)]" />
          <div>
            <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
              Chưa có hồ sơ website
            </p>
            <p className="mt-0.5 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
              Chạy quét kỹ thuật để tự động nhận diện lĩnh vực, chủ đề và tốc độ tải trang.
            </p>
          </div>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/${siteId}/audit`}>
            Quét ngay
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </Button>
      </Card>
    )
  }

  const { siteProfile } = run

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[length:var(--text-base)] font-semibold text-[var(--color-ink)]">
              {siteProfile.businessName ?? 'Chưa rõ tên doanh nghiệp'}
            </p>
            {siteProfile.category ? <Badge tone="signal">{siteProfile.category}</Badge> : null}
          </div>
          {siteProfile.description ? (
            <p className="mt-1.5 max-w-[60ch] text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
              {siteProfile.description}
            </p>
          ) : null}
          {siteProfile.categoryConfidence ? (
            <p className="mt-1.5 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
              {CONFIDENCE_LABELS[siteProfile.categoryConfidence]} · quét {siteProfile.pagesAnalyzed} trang
            </p>
          ) : null}
          {run.blockedByBotProtection ? (
            <div className="mt-1.5 flex flex-wrap items-start gap-x-1.5 gap-y-1 text-[length:var(--text-xs)] text-[var(--color-negative)]">
              <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Bị hệ thống chống bot chặn khi quét sâu — chưa nhận diện được lĩnh
                vực/từ khoá.
              </span>
              <BotProtectionGuide />
            </div>
          ) : null}
        </div>

        <Button asChild variant="ghost" size="sm">
          <Link href={`/${siteId}/audit`}>
            Xem chi tiết
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </Button>
      </div>

      {siteProfile.topKeywords.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {siteProfile.topKeywords.map((keyword) => (
            <Badge key={keyword} tone="outline">
              {keyword}
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
