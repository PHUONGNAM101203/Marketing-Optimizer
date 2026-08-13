'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Smartphone, Monitor } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { PageSpeedResult, PageSpeedStrategy, PageSpeedStrategyResult } from '@/lib/domain/audit'
import { cn } from '@/lib/cn'
import { formatRelativeTime } from '@/lib/format'

/* Hallmark · component: pagespeed-report · theme: studied-DNA (Ink & Signal)
 *
 * Bố cục cố tình bám sát báo cáo PageSpeed Insights thật — 4 vòng điểm tròn
 * theo đúng thang màu Google dùng (đỏ/cam/xanh ở 50 và 90), rồi tới 5 chỉ số
 * Lab Data với nhãn Đạt/Trung bình/Kém theo ĐÚNG ngưỡng Core Web Vitals
 * chính thức — không tự chế một thang điểm khác cho "giống giống". Đổi được
 * Mobile/Desktop như trang pagespeed.web.dev thật — hai số liệu THỰC KHÁC
 * NHAU (mỗi chiến lược một lượt gọi Lighthouse riêng), không phải hiện lại
 * cùng một số dưới nhãn khác.
 *
 * CỐ TÌNH chỉ hiện tóm tắt (4 điểm + 5 chỉ số + "cơ hội cải thiện") — không
 * lặp lại audit chi tiết của cả 4 hạng mục trong app (đã thử, bỏ lại vì tốn
 * thêm chi phí xử lý mỗi lượt quét). Ai cần xem đầy đủ bấm "Mở báo cáo đầy
 * đủ" ra thẳng pagespeed.web.dev thật.
 */

type Tone = 'positive' | 'caution' | 'negative' | 'neutral'

const toneOfScore = (score: number | null): Tone =>
  score === null ? 'neutral' : score >= 90 ? 'positive' : score >= 50 ? 'caution' : 'negative'

const TONE_COLOR: Readonly<Record<Tone, string>> = {
  positive: 'var(--color-positive)',
  caution: 'var(--color-caution)',
  negative: 'var(--color-negative)',
  neutral: 'var(--color-ink-3)',
}

const TONE_LABEL: Readonly<Record<Tone, string>> = {
  positive: 'Đạt',
  caution: 'Trung bình',
  negative: 'Kém',
  neutral: '—',
}

const STRATEGY_LABEL: Readonly<Record<PageSpeedStrategy, string>> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
}

const STRATEGY_ICON: Readonly<Record<PageSpeedStrategy, typeof Monitor>> = {
  desktop: Monitor,
  mobile: Smartphone,
}

export function PageSpeedReport({
  pagespeed,
  pageUrl,
}: {
  readonly pagespeed: PageSpeedResult | null
  readonly pageUrl: string
}) {
  // Mặc định Desktop — khớp mặc định của pagespeed.web.dev thật khi mở link
  // (trang Google mở lên là tab Mobile theo lịch sử, nhưng người dùng ở đây
  // yêu cầu rõ Desktop làm mặc định cho công cụ nội bộ này).
  const [strategy, setStrategy] = useState<PageSpeedStrategy>('desktop')

  if (!pagespeed) {
    return (
      <Card className="flex flex-col gap-1.5 p-5">
        <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
          PageSpeed Insights chưa có dữ liệu
        </p>
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          Đã bật API ở Google Cloud thôi chưa đủ — cần tạo một <strong>API key</strong> (khác OAuth
          Client ID/Secret) ở Google Cloud Console → APIs &amp; Services →{' '}
          <strong>Credentials</strong> → Create API key, giới hạn vào &quot;PageSpeed Insights
          API&quot;, rồi dán vào thẻ Google trong trang Kết nối (&quot;Cập nhật OAuth app&quot;) và
          quét lại.
        </p>
      </Card>
    )
  }

  const current = pagespeed[strategy]

  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
            PageSpeed Insights
          </p>
          <div role="tablist" aria-label="Chiến lược" className="flex gap-0.5 rounded-[var(--radius-sm)] bg-[var(--color-paper-2)] p-0.5">
            {(['desktop', 'mobile'] as const).map((option) => {
              const Icon = STRATEGY_ICON[option]
              return (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={strategy === option}
                  onClick={() => setStrategy(option)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-[calc(var(--radius-sm)-2px)] px-2.5 py-1',
                    'text-[length:var(--text-xs)] font-medium',
                    'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
                    strategy === option
                      ? 'bg-[var(--color-paper)] text-[var(--color-ink)] shadow-sm'
                      : 'text-[var(--color-ink-3)] hover:text-[var(--color-ink)]',
                  )}
                >
                  <Icon aria-hidden className="size-3.5" />
                  {STRATEGY_LABEL[option]}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {current ? (
            <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
              Đo {formatRelativeTime(current.fetchedAt, new Date())}
            </p>
          ) : null}
          <Link
            href={`https://pagespeed.web.dev/report?url=${encodeURIComponent(pageUrl)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[length:var(--text-xs)] font-medium text-[var(--color-signal)] hover:underline"
          >
            Mở báo cáo đầy đủ
            <ExternalLink aria-hidden className="size-3" />
          </Link>
        </div>
      </div>

      {current ? (
        <PageSpeedStrategyPanel result={current} />
      ) : (
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          Chưa lấy được số liệu {STRATEGY_LABEL[strategy]} — lượt gọi PageSpeed Insights cho chiến
          lược này bị lỗi hoặc quá thời gian chờ ở lượt quét gần nhất, thử &quot;Quét lại&quot;.
        </p>
      )}
    </Card>
  )
}

function PageSpeedStrategyPanel({ result }: { readonly result: PageSpeedStrategyResult }) {
  return (
    <>
      <div className="flex flex-wrap justify-around gap-4">
        <ScoreGauge label="Hiệu năng" score={result.performanceScore} />
        <ScoreGauge label="Accessibility" score={result.accessibilityScore} />
        <ScoreGauge label="Best Practices" score={result.bestPracticesScore} />
        <ScoreGauge label="SEO" score={result.seoScore} />
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-rule)] pt-4 sm:grid-cols-5">
        <VitalStat label="FCP" ms={result.fcpMs} thresholds={[1800, 3000]} />
        <VitalStat label="LCP" ms={result.lcpMs} thresholds={[2500, 4000]} />
        <VitalStat label="TBT" ms={result.tbtMs} thresholds={[200, 600]} unit="ms" />
        <VitalStat label="CLS" ms={result.cls} thresholds={[0.1, 0.25]} isRaw />
        <VitalStat label="Speed Index" ms={result.speedIndexMs} thresholds={[3400, 5800]} />
      </div>

      {(result.opportunities?.length ?? 0) > 0 ? (
        <div className="flex flex-col gap-2 border-t border-[var(--color-rule)] pt-4">
          <p className="text-[length:var(--text-xs)] font-medium tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
            Cơ hội cải thiện
          </p>
          <ul className="flex flex-col gap-1.5">
            {result.opportunities.map((opportunity) => (
              <li
                key={opportunity.title}
                className="flex items-center justify-between gap-3 text-[length:var(--text-sm)]"
              >
                <span className="text-[var(--color-ink-2)]">{opportunity.title}</span>
                {opportunity.savings ? (
                  <span className="shrink-0 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                    {opportunity.savings}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}

function ScoreGauge({ label, score }: { readonly label: string; readonly score: number | null }) {
  const tone = toneOfScore(score)
  const color = TONE_COLOR[tone]
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const progress = (score ?? 0) / 100
  const offset = circumference * (1 - progress)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`${label}: ${score ?? 'chưa có'}`}>
        <circle cx="38" cy="38" r={radius} stroke="var(--color-rule)" strokeWidth="6" fill="none" />
        {score !== null ? (
          <circle
            cx="38"
            cy="38"
            r={radius}
            stroke={color}
            strokeWidth="6"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 38 38)"
          />
        ) : null}
        <text
          x="38"
          y="44"
          textAnchor="middle"
          className="text-[length:var(--text-lg)] font-semibold"
          fill={color}
        >
          {score ?? '—'}
        </text>
      </svg>
      <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">{label}</p>
    </div>
  )
}

function VitalStat({
  label,
  ms,
  thresholds,
  unit = 's',
  isRaw = false,
}: {
  readonly label: string
  readonly ms: number | null
  readonly thresholds: readonly [number, number]
  readonly unit?: 's' | 'ms'
  readonly isRaw?: boolean
}) {
  const tone: Tone = ms === null ? 'neutral' : ms <= thresholds[0] ? 'positive' : ms <= thresholds[1] ? 'caution' : 'negative'
  const value =
    ms === null
      ? '—'
      : isRaw
        ? ms.toFixed(2)
        : unit === 's'
          ? `${(ms / 1000).toFixed(1)}s`
          : `${Math.round(ms)}ms`

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">{label}</p>
      <p data-numeric className="text-[length:var(--text-base)] font-semibold text-[var(--color-ink)]">
        {value}
      </p>
      <Badge tone={tone === 'neutral' ? 'neutral' : tone}>{TONE_LABEL[tone]}</Badge>
    </div>
  )
}
