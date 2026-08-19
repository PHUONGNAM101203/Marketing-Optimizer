import { notFound } from 'next/navigation'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { ReportBuilder } from '@/components/explore/report-builder'
import { UrlTabs } from '@/components/ui/tabs'
import { getSite } from '@/lib/data/sites'
import { getExploreSource, type ExploreSource } from '@/lib/data/site-explore'
import { parseCustomRangeParams, parseRangeParam } from '@/lib/domain/date-range-param'
import { resolveDateRange } from '@/mock/dates'
import { formatDateRange } from '@/lib/format'

export const metadata = { title: 'Khám phá' }

const EMPTY_SOURCE: ExploreSource = {
  ga4: null,
  gsc: null,
  youtube: null,
  instagram: null,
  facebook: null,
  tiktok: null,
}

/** Tách theo ĐÚNG `ProviderFamily` app đã dùng khắp nơi khác (`domain/providers.ts`:
 * 'google' | 'youtube' | 'meta' | 'tiktok') — YouTube vốn đã là family riêng,
 * không gộp vào 'google', nên tab ở đây theo cùng ranh giới đó, không tự bịa
 * một cách chia khác. Mỗi tab nhận một `ExploreSource` chỉ còn field của
 * đúng family đó — `ReportBuilder` không cần biết gì về khái niệm "family",
 * nó chỉ thấy field nào có/không có, giống hệt cách nó đã hoạt động trước khi
 * có tab. */
const familySource = (source: ExploreSource, family: 'google' | 'youtube' | 'meta' | 'tiktok'): ExploreSource => {
  switch (family) {
    case 'google':
      return { ...EMPTY_SOURCE, ga4: source.ga4, gsc: source.gsc }
    case 'youtube':
      return { ...EMPTY_SOURCE, youtube: source.youtube }
    case 'meta':
      return { ...EMPTY_SOURCE, instagram: source.instagram, facebook: source.facebook }
    case 'tiktok':
      return { ...EMPTY_SOURCE, tiktok: source.tiktok }
  }
}

const hasData = (source: ExploreSource): boolean =>
  Boolean(source.ga4 || source.gsc || source.youtube || source.instagram || source.facebook || source.tiktok)

export default async function ExplorePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly siteId: string }>
  readonly searchParams: Promise<{ readonly range?: string; readonly from?: string; readonly to?: string }>
}) {
  const { siteId } = await params
  const { range: rangeParam, from, to } = await searchParams
  const site = await getSite(siteId)
  if (!site) notFound()

  const range = resolveDateRange(
    parseRangeParam(rangeParam),
    new Date(),
    parseCustomRangeParams(from, to) ?? undefined,
  )

  // Fetch MỘT LẦN duy nhất — số hàng, hạng mục GA4/GSC, kênh và chỉ số hiển
  // thị đều là bộ lọc CLIENT-SIDE trong `ReportBuilder` (xem JSDoc ở đó),
  // không gọi lại GA4/GSC/YouTube/Meta/TikTok mỗi lần bấm nút. Chỉ đổi khoảng
  // ngày mới cần một lượt tải trang mới — đúng bản chất, vì đó là dữ liệu
  // THẬT khác.
  const source = await getExploreSource(site.id, { startDate: range.start, endDate: range.end })

  const familyTabs = (
    [
      { id: 'google', label: 'Google', family: 'google' as const },
      { id: 'youtube', label: 'YouTube', family: 'youtube' as const },
      { id: 'meta', label: 'Meta', family: 'meta' as const },
      { id: 'tiktok', label: 'TikTok', family: 'tiktok' as const },
    ] as const
  )
    .map((tab) => ({ ...tab, source: familySource(source, tab.family) }))
    .filter((tab) => hasData(tab.source))

  return (
    <PageShell>
      <PageHeader
        title="Khám phá"
        description="Mỗi tab là một nền tảng riêng — đầy đủ mọi kết nối và mọi hạng mục thuộc nền tảng đó, để so sánh trong CÙNG một nền tảng có ý nghĩa thay vì trộn lẫn những chỉ số khác bản chất nhau."
        meta={
          <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
            {formatDateRange(range.start, range.end)}
          </p>
        }
      />

      <DataGate
        siteId={site.id}
        title="Chưa có dữ liệu để khám phá"
        description="Trang này cần ít nhất một kết nối có số liệu thật."
      >
        {familyTabs.length > 0 ? (
          <UrlTabs
            ariaLabel="Nền tảng"
            tabs={familyTabs.map((tab) => ({
              id: tab.id,
              label: tab.label,
              panel: <ReportBuilder source={tab.source} currency={site.currency} />,
            }))}
          />
        ) : null}
      </DataGate>
    </PageShell>
  )
}
