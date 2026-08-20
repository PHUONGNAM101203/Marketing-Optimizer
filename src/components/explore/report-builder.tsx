'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import { ToggleChip } from '@/components/ui/toggle-chip'
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableScroller,
} from '@/components/ui/table'
import {
  formatCompact,
  formatCurrencyCompact,
  formatMultiplier,
  formatNumber,
  formatPercent,
} from '@/lib/format'
import { colorTokenOf } from '@/mock/metrics'
import type { ExploreConnectionEntry, ExploreSource } from '@/lib/data/site-explore'
import {
  DEFAULT_GA4_EXPLORE_DIMENSION,
  DEFAULT_GSC_EXPLORE_DIMENSION,
  GA4_EXPLORE_DIMENSIONS,
  GA4_EXPLORE_DIMENSION_LABELS,
  GSC_EXPLORE_DIMENSIONS,
  GSC_EXPLORE_DIMENSION_LABELS,
  type Ga4ExploreDimension,
  type GscExploreDimension,
} from '@/lib/domain/explore-dimension'
import {
  DEFAULT_EXPLORE_ROW_LIMIT,
  EXPLORE_ROW_LIMITS,
  type ExploreRowLimit,
} from '@/lib/domain/explore-row-limit'

/* Trình dựng báo cáo.
 *
 * TẤT CẢ bộ lọc (số hàng, hạng mục GA4/GSC, kênh, chỉ số, sắp xếp, trang) xử
 * lý HOÀN TOÀN ở client bằng `useState`/`useMemo` — không một cú bấm nào gọi
 * lại server. `source` đã mang sẵn TOÀN BỘ breakdown (tới 1000 dòng mỗi
 * nền tảng, mọi hạng mục) từ một lượt fetch DUY NHẤT lúc tải trang (xem
 * `getExploreSource` trong `site-explore.ts`) — đổi số hàng/hạng mục chỉ là
 * cắt lại đúng mảng đã có sẵn trong bộ nhớ, không phải gọi GA4/GSC/YouTube
 * thêm lần nào. Trước đây mỗi lượt đổi là một điều hướng Link mới → gọi lại
 * API thật, chậm rõ rệt vì phải chờ Google trả lời.
 */

export interface ReportRow {
  readonly key: string
  readonly dimension: string
  readonly group: string
  readonly colorToken: string
  readonly impressions: number | null
  readonly clicks: number | null
  readonly costMicros: number | null
  readonly conversions: number | null
  readonly ctr: number | null
  readonly cpaMicros: number | null
  readonly roas: number | null
  /** Ba cột dưới đây phục vụ Meta/TikTok/YouTube (tương tác nội dung hữu cơ)
   * — GA4/GSC không có khái niệm này nên luôn `null` ở hàng của chúng, không
   * phải thiếu sót. */
  readonly likes: number | null
  readonly comments: number | null
  readonly shares: number | null
  /** Doanh thu quy đổi — phục vụ Klaviyo (campaign/flow), nền tảng KHÔNG có
   * khái niệm "chi phí" (không phải nền tảng quảng cáo) nên `costMicros`/
   * `cpaMicros`/`roas` không hợp nghĩa cho nó, cần cột riêng. */
  readonly revenueMicros: number | null
  /** Đơn vị tiền THẬT để format `revenueMicros` của DÒNG NÀY — `null` dùng
   * `currency` chung của trang (đúng cho Google/Meta/TikTok, vì `costMicros`/
   * `cpaMicros` của họ THẬT SỰ là site.currency). Klaviyo set field này vì
   * doanh thu của nó luôn ở đơn vị riêng của tài khoản Klaviyo
   * (`preferred_currency`), không liên quan gì đến site.currency. */
  readonly revenueCurrency: string | null
}

type MetricKey = Exclude<keyof ReportRow, 'key' | 'dimension' | 'group' | 'colorToken' | 'revenueCurrency'>

type Formatter = 'compact' | 'number' | 'currency' | 'percent' | 'multiplier'

interface MetricColumn {
  readonly key: MetricKey
  readonly label: string
  readonly formatter: Formatter
}

const COLUMNS: readonly MetricColumn[] = [
  { key: 'impressions', label: 'Hiển thị/Lượt xem', formatter: 'compact' },
  { key: 'clicks', label: 'Lượt nhấp', formatter: 'compact' },
  { key: 'ctr', label: 'CTR', formatter: 'percent' },
  { key: 'costMicros', label: 'Chi phí', formatter: 'currency' },
  { key: 'conversions', label: 'Chuyển đổi', formatter: 'number' },
  { key: 'cpaMicros', label: 'CPA', formatter: 'currency' },
  { key: 'roas', label: 'ROAS', formatter: 'multiplier' },
  { key: 'likes', label: 'Lượt thích', formatter: 'compact' },
  { key: 'comments', label: 'Bình luận', formatter: 'compact' },
  { key: 'shares', label: 'Chia sẻ', formatter: 'compact' },
  { key: 'revenueMicros', label: 'Doanh thu', formatter: 'currency' },
]

const DEFAULT_METRICS: readonly MetricKey[] = [
  'impressions',
  'clicks',
  'ctr',
  'costMicros',
  'conversions',
  'cpaMicros',
  'roas',
  'likes',
  'comments',
  'shares',
  'revenueMicros',
]

/** Nhãn "Kênh" cho một connection — chỉ gắn thêm tên tài khoản khi provider
 * đó có TỪ 2 CONNECTION TRỞ LÊN trên site (vd. 2 tài khoản TikTok). Trường
 * hợp phổ biến nhất (1 connection/provider) giữ nguyên nhãn gọn cũ
 * ('TikTok', không phải 'TikTok · Tên tài khoản') — không làm rối bảng cho
 * đa số người dùng chỉ có một tài khoản mỗi nền tảng. */
const groupLabel = (providerLabel: string, accountName: string, connectionCount: number): string =>
  connectionCount > 1 ? `${providerLabel} · ${accountName}` : providerLabel

/** `impressions` đứng thay cho "lượt xem/sessions" của GA4/YouTube — không
 * có cột riêng cho views trong `ReportRow` (schema đó vốn dành cho ads), và
 * "được nhìn thấy bao nhiêu lần" là đúng bản chất impressions diễn tả. */
const buildExploreRows = (
  source: ExploreSource,
  rowLimit: number,
  ga4Dimension: Ga4ExploreDimension,
  gscDimension: GscExploreDimension,
): readonly ReportRow[] => {
  const rows: ReportRow[] = []

  for (const entry of source.ga4) {
    const ga4 = entry.data
    const group = groupLabel('GA4', entry.accountName, source.ga4.length)
    const ga4Rows: readonly { readonly label: string; readonly value: number }[] =
      ga4Dimension === 'channel'
        ? ga4.channels.map((row) => ({ label: row.channel, value: row.sessions }))
        : ga4Dimension === 'device'
          ? ga4.devices.map((row) => ({ label: row.device, value: row.sessions }))
          : ga4Dimension === 'country'
            ? ga4.countries.map((row) => ({ label: row.country, value: row.sessions }))
            : ga4.topPages.map((row) => ({ label: row.path, value: row.views }))
    rows.push(
      ...ga4Rows.slice(0, rowLimit).map(
        (row): ReportRow => ({
          key: `ga4:${entry.connectionId}:${ga4Dimension}:${row.label}`,
          dimension: row.label,
          group,
          colorToken: colorTokenOf('ga4'),
          impressions: row.value,
          clicks: null,
          costMicros: null,
          conversions: null,
          ctr: null,
          cpaMicros: null,
          roas: null,
          revenueMicros: null,
          revenueCurrency: null,
          likes: null,
          comments: null,
          shares: null,
        }),
      ),
    )
  }

  for (const entry of source.gsc) {
    const gsc = entry.data
    const group = groupLabel('Search Console', entry.accountName, source.gsc.length)
    // Chỉ Truy vấn/Trang có sẵn impressions+CTR — Quốc gia/Thiết bị của
    // Search Console chỉ trả về clicks (xem `GscExplore` trong
    // `google-explore.ts`), nên hai cột kia hợp lệ là `null`, không phải
    // thiếu sót.
    const gscRows: readonly {
      readonly label: string
      readonly clicks: number
      readonly impressions: number | null
    }[] =
      gscDimension === 'page'
        ? gsc.topPages.map((row) => ({ label: row.page, clicks: row.clicks, impressions: row.impressions }))
        : gscDimension === 'country'
          ? gsc.countries.map((row) => ({ label: row.country, clicks: row.clicks, impressions: null }))
          : gscDimension === 'device'
            ? gsc.devices.map((row) => ({ label: row.device, clicks: row.clicks, impressions: null }))
            : gsc.topQueries.map((row) => ({ label: row.query, clicks: row.clicks, impressions: row.impressions }))
    rows.push(
      ...gscRows.slice(0, rowLimit).map(
        (row): ReportRow => ({
          key: `gsc:${entry.connectionId}:${gscDimension}:${row.label}`,
          dimension: row.label,
          group,
          colorToken: colorTokenOf('gsc'),
          impressions: row.impressions,
          clicks: row.clicks,
          costMicros: null,
          conversions: null,
          ctr: row.impressions && row.impressions > 0 ? row.clicks / row.impressions : null,
          cpaMicros: null,
          roas: null,
          revenueMicros: null,
          revenueCurrency: null,
          likes: null,
          comments: null,
          shares: null,
        }),
      ),
    )
  }

  for (const entry of source.youtube) {
    const group = groupLabel('YouTube', entry.accountName, source.youtube.length)
    rows.push(
      ...entry.data.topVideos.slice(0, rowLimit).map(
        (video): ReportRow => ({
          key: `youtube:${entry.connectionId}:${video.title}`,
          dimension: video.title,
          group,
          colorToken: colorTokenOf('youtube'),
          impressions: video.views,
          clicks: null,
          costMicros: null,
          conversions: null,
          ctr: null,
          cpaMicros: null,
          roas: null,
          revenueMicros: null,
          revenueCurrency: null,
          likes: video.likes,
          comments: video.comments,
          shares: video.shares,
        }),
      ),
    )
  }

  for (const entry of source.instagram) {
    const group = groupLabel('Instagram', entry.accountName, source.instagram.length)
    rows.push(
      ...entry.data.topPosts.slice(0, rowLimit).map(
        (post): ReportRow => ({
          key: `instagram:${entry.connectionId}:${post.caption}`,
          dimension: post.caption,
          group,
          colorToken: colorTokenOf('instagram'),
          impressions: null,
          clicks: null,
          costMicros: null,
          conversions: null,
          ctr: null,
          cpaMicros: null,
          roas: null,
          revenueMicros: null,
          revenueCurrency: null,
          likes: post.likes,
          comments: post.comments,
          // Instagram Graph API không trả shares cho bài đăng qua field cơ
          // bản này (xem `InstagramExplore` trong `meta-explore.ts`).
          shares: null,
        }),
      ),
    )
  }

  for (const entry of source.facebook) {
    const group = groupLabel('Facebook', entry.accountName, source.facebook.length)
    rows.push(
      ...entry.data.topPosts.slice(0, rowLimit).map(
        (post): ReportRow => ({
          key: `facebook:${entry.connectionId}:${post.message}`,
          dimension: post.message,
          group,
          colorToken: colorTokenOf('facebook'),
          impressions: null,
          clicks: null,
          costMicros: null,
          conversions: null,
          ctr: null,
          cpaMicros: null,
          roas: null,
          revenueMicros: null,
          revenueCurrency: null,
          likes: post.reactions,
          comments: post.comments,
          shares: post.shares,
        }),
      ),
    )
  }

  for (const entry of source.tiktok) {
    const group = groupLabel('TikTok', entry.accountName, source.tiktok.length)
    rows.push(
      ...entry.data.topVideos.slice(0, rowLimit).map(
        (video): ReportRow => ({
          key: `tiktok:${entry.connectionId}:${video.title}`,
          dimension: video.title,
          group,
          colorToken: colorTokenOf('tiktok'),
          impressions: video.views,
          clicks: null,
          costMicros: null,
          conversions: null,
          ctr: null,
          cpaMicros: null,
          roas: null,
          revenueMicros: null,
          revenueCurrency: null,
          likes: video.likes,
          comments: video.comments,
          shares: video.shares,
        }),
      ),
    )
  }

  for (const entry of source.klaviyo) {
    const klaviyo = entry.data
    // 'Campaign'/'Flow' làm phụ-nhóm bên trong Klaviyo — người xem cần phân
    // biệt ngay một dòng chi phí gửi thủ công (campaign) hay tự động lặp lại
    // (flow), hai bản chất khác hẳn nhau dù cùng chỉ số. `baseGroup` gắn
    // thêm tên tài khoản khi có ≥2 connection Klaviyo, giống mọi provider
    // khác — trường hợp phổ biến (1 connection) vẫn ra đúng 'Klaviyo ·
    // Campaign'/'Klaviyo · Flow' như trước.
    const baseGroup = groupLabel('Klaviyo', entry.accountName, source.klaviyo.length)
    // Campaign + flow gộp CHUNG một mảng ở tầng data (`site-explore.ts`) —
    // cắt `rowLimit` trên mảng gộp đó khiến 58 campaign (đứng trước trong
    // mảng) chiếm hết `rowLimit`, flow không bao giờ lọt vào dù đã tick
    // "Klaviyo · Flow" ở bộ lọc Kênh. Cắt RIÊNG từng loại, giống cách mọi
    // provider khác (GA4/GSC/YouTube/Instagram/Facebook/TikTok) đều cắt
    // trên MỘT mảng đồng nhất của riêng nó — Klaviyo là provider DUY NHẤT
    // trộn hai "loại" khác nhau vào một nguồn, nên cần xử lý khác một chút.
    const buildRow = (item: (typeof klaviyo.items)[number]): ReportRow => ({
      key: `klaviyo:${entry.connectionId}:${item.kind}:${item.id}`,
      dimension: item.name,
      group: `${baseGroup} · ${item.kind === 'campaign' ? 'Campaign' : 'Flow'}`,
      colorToken: colorTokenOf('klaviyo'),
      impressions: item.recipients,
      clicks: item.clicks,
      costMicros: null,
      conversions: item.conversions,
      ctr: item.recipients > 0 ? item.clicks / item.recipients : null,
      cpaMicros: null,
      roas: null,
      revenueMicros: item.revenueMicros,
      revenueCurrency: klaviyo.currency,
      likes: null,
      comments: null,
      shares: null,
    })
    rows.push(
      ...klaviyo.items.filter((item) => item.kind === 'campaign').slice(0, rowLimit).map(buildRow),
      ...klaviyo.items.filter((item) => item.kind === 'flow').slice(0, rowLimit).map(buildRow),
    )
  }

  return rows
}

export interface ReportBuilderProps {
  readonly source: ExploreSource
  readonly currency: string
}

// Số hàng chọn được (10-1000) là số hàng CẮT RA từ dữ liệu đã fetch sẵn —
// hiển thị vẫn phân trang cố định 50 hàng/trang, không đổ hết 1000 hàng
// xuống một bảng dài vô tận.
const PAGE_SIZE = 50

export function ReportBuilder({ source, currency }: ReportBuilderProps) {
  const groups = useMemo(() => {
    const list: string[] = []
    // Mỗi connection góp MỘT giá trị group riêng (xem `groupLabel`) — site
    // có 2 tài khoản TikTok thì đây phải liệt kê cả 'TikTok · Kênh A' lẫn
    // 'TikTok · Kênh B', không chỉ 'TikTok' chung chung, để chip lọc khớp
    // đúng giá trị `row.group` thật sự nằm trong `rows`.
    const pushProviderGroups = <T,>(providerLabel: string, entries: readonly ExploreConnectionEntry<T>[]) => {
      entries.forEach((entry) => list.push(groupLabel(providerLabel, entry.accountName, entries.length)))
    }
    pushProviderGroups('GA4', source.ga4)
    pushProviderGroups('Search Console', source.gsc)
    pushProviderGroups('YouTube', source.youtube)
    pushProviderGroups('Instagram', source.instagram)
    pushProviderGroups('Facebook', source.facebook)
    pushProviderGroups('TikTok', source.tiktok)
    // Klaviyo tách 'group' thêm một tầng nữa (Campaign/Flow, xem
    // `buildExploreRows`) — cả hai phải có mặt ở đây để chip lọc kênh bắt
    // được đúng giá trị đang thật sự nằm trong `rows`.
    source.klaviyo.forEach((entry) => {
      const baseGroup = groupLabel('Klaviyo', entry.accountName, source.klaviyo.length)
      list.push(`${baseGroup} · Campaign`, `${baseGroup} · Flow`)
    })
    return list
  }, [source])

  const [rowLimit, setRowLimit] = useState<ExploreRowLimit>(DEFAULT_EXPLORE_ROW_LIMIT)
  const [ga4Dimension, setGa4Dimension] = useState<Ga4ExploreDimension>(DEFAULT_GA4_EXPLORE_DIMENSION)
  const [gscDimension, setGscDimension] = useState<GscExploreDimension>(DEFAULT_GSC_EXPLORE_DIMENSION)
  const [selectedMetrics, setSelectedMetrics] =
    useState<readonly MetricKey[]>(DEFAULT_METRICS)
  const [activeGroups, setActiveGroups] = useState<readonly string[]>(groups)
  const [sortBy, setSortBy] = useState<MetricKey>('costMicros')
  const [page, setPage] = useState(1)

  const rows = useMemo(
    () => buildExploreRows(source, rowLimit, ga4Dimension, gscDimension),
    [source, rowLimit, ga4Dimension, gscDimension],
  )

  const visibleColumns = COLUMNS.filter((column) =>
    selectedMetrics.includes(column.key),
  )

  const visibleRows = useMemo(
    () =>
      rows
        .filter((row) => activeGroups.includes(row.group))
        .slice()
        .sort((a, b) => (b[sortBy] ?? -Infinity) - (a[sortBy] ?? -Infinity)),
    [rows, activeGroups, sortBy],
  )

  // Kẹp lại thay vì reset bằng `useEffect` — đổi bộ lọc/sắp xếp/số hàng làm
  // tập kết quả ngắn đi có thể khiến trang đang xem vượt quá tổng số trang
  // mới; kẹp về trang cuối còn hợp lệ, giống hệt cách `currentPage` ở phần
  // Merchant Center (`channel-detail-body.tsx`) tự xử lý cùng tình huống.
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = visibleRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const toggle = <T,>(list: readonly T[], value: T): readonly T[] =>
    list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value]

  const format = (value: number | null, formatter: Formatter, rowCurrency: string | null): string => {
    switch (formatter) {
      case 'currency':
        // `rowCurrency` (Klaviyo) ghi đè `currency` chung của trang khi có —
        // xem `ReportRow.revenueCurrency`.
        return formatCurrencyCompact(value, rowCurrency ?? currency)
      case 'percent':
        return formatPercent(value, 2)
      case 'multiplier':
        return formatMultiplier(value)
      case 'number':
        return formatNumber(value)
      default:
        return formatCompact(value)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card tone="inset" className="p-5">
        <fieldset className="mb-5">
          <legend className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
            Số hàng mỗi nền tảng
          </legend>
          <div className="flex flex-wrap gap-2">
            {EXPLORE_ROW_LIMITS.map((limit) => (
              <ToggleChip
                key={limit}
                label={String(limit)}
                active={rowLimit === limit}
                onToggle={() => setRowLimit(limit)}
              />
            ))}
          </div>
        </fieldset>

        {source.ga4.length > 0 ? (
          <fieldset className="mb-5">
            <legend className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
              GA4 theo
            </legend>
            <div className="flex flex-wrap gap-2">
              {GA4_EXPLORE_DIMENSIONS.map((dimension) => (
                <ToggleChip
                  key={dimension}
                  label={GA4_EXPLORE_DIMENSION_LABELS[dimension]}
                  active={ga4Dimension === dimension}
                  onToggle={() => setGa4Dimension(dimension)}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        {source.gsc.length > 0 ? (
          <fieldset className="mb-5">
            <legend className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
              Search Console theo
            </legend>
            <div className="flex flex-wrap gap-2">
              {GSC_EXPLORE_DIMENSIONS.map((dimension) => (
                <ToggleChip
                  key={dimension}
                  label={GSC_EXPLORE_DIMENSION_LABELS[dimension]}
                  active={gscDimension === dimension}
                  onToggle={() => setGscDimension(dimension)}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="mb-5">
          <legend className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
            Kênh
          </legend>
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <ToggleChip
                key={group}
                label={group}
                active={activeGroups.includes(group)}
                onToggle={() => setActiveGroups(toggle(activeGroups, group))}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
            Chỉ số
          </legend>
          <div className="flex flex-wrap gap-2">
            {COLUMNS.map((column) => (
              <ToggleChip
                key={column.key}
                label={column.label}
                active={selectedMetrics.includes(column.key)}
                onToggle={() =>
                  setSelectedMetrics(toggle(selectedMetrics, column.key))
                }
              />
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="overflow-hidden">
        {visibleRows.length === 0 || visibleColumns.length === 0 ? (
          <EmptyState
            title="Chưa chọn gì để hiển thị"
            description="Bật ít nhất một kênh và một chỉ số ở trên."
          />
        ) : (
          <TableScroller aria-label="Kết quả báo cáo">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Hạng mục</TH>
                  <TH>Kênh</TH>
                  {visibleColumns.map((column) => (
                    <TH key={column.key} numeric>
                      <button
                        type="button"
                        onClick={() => setSortBy(column.key)}
                        className={cn(
                          'rounded-[var(--radius-xs)] uppercase',
                          'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
                          sortBy === column.key
                            ? 'text-[var(--color-signal)]'
                            : 'hover:text-[var(--color-ink)]',
                        )}
                      >
                        {column.label}
                        {sortBy === column.key ? ' ↓' : ''}
                      </button>
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {pagedRows.map((row) => (
                  <TR key={row.key}>
                    <TD className="max-w-[20rem]">
                      <span className="block truncate" title={row.dimension}>
                        {row.dimension}
                      </span>
                    </TD>
                    <TD>
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-[var(--radius-xs)]"
                          style={{ background: `var(${row.colorToken})` }}
                        />
                        <span className="truncate">{row.group}</span>
                      </span>
                    </TD>
                    {visibleColumns.map((column) => (
                      <TD key={column.key} numeric>
                        {format(
                          row[column.key],
                          column.formatter,
                          column.key === 'revenueMicros' ? row.revenueCurrency : null,
                        )}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroller>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
          <Badge tone="outline">{visibleRows.length} dòng</Badge>{' '}
          <span className="ml-2">
            Bấm vào tiêu đề cột số để đổi cột sắp xếp.
          </span>
        </p>

        {totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage === 1}
              className="rounded-[var(--radius-sm)] border border-[var(--color-rule-strong)] px-2.5 py-1 text-[length:var(--text-xs)] font-medium text-[var(--color-ink-2)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:text-[var(--color-ink)] disabled:pointer-events-none disabled:opacity-40"
            >
              Trước
            </button>
            <span className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
              Trang {currentPage}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage === totalPages}
              className="rounded-[var(--radius-sm)] border border-[var(--color-rule-strong)] px-2.5 py-1 text-[length:var(--text-xs)] font-medium text-[var(--color-ink-2)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:text-[var(--color-ink)] disabled:pointer-events-none disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
