import { AlertTriangle, ImageOff } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { MetaPostDetailDialog } from './meta-post-detail-dialog'
import type { MetaPostItem } from './meta-post-list'
import { formatCompact, formatDate } from '@/lib/format'

/* Hallmark · component: meta-ranking-list · theme: studied-DNA (Ink & Signal)
 *
 * Danh sách hàng ngang có số thứ hạng — KHÁC `MetaPostList` (lưới thẻ ảnh
 * lớn, dùng cho tab Tổng quan duyệt bài đăng). Bảng xếp hạng chỉ hiện top 5
 * mỗi mục (xem nơi gọi trong `meta-dashboard.tsx`/`meta-trending-widget.tsx`)
 * — lưới thẻ với 5 mục để lại một ô trống lẻ loi ở dòng cuối, còn dạng hàng
 * dọc luôn lấp đầy gọn gàng bất kể số lượng, đúng ngôn ngữ "bảng xếp hạng"
 * quen thuộc hơn lưới ảnh duyệt nội dung. Tái dùng `MetaPostDetailDialog`
 * (đã có, không tạo dialog riêng) — cùng click-to-expand với `MetaPostList`.
 */
export function MetaRankingList({
  items,
  fetchError,
  emptyTitle,
  emptyDescription,
}: {
  readonly items: readonly MetaPostItem[]
  /** Cùng quy ước `MetaPostList.fetchError` — lỗi request thật, khác "chưa
   * có bài đăng". `undefined` (mặc định) cho bảng xếp hạng mọi thời gian,
   * vốn không tự gọi API riêng (đọc từ `trending` đã fetch sẵn). */
  readonly fetchError?: string | null
  readonly emptyTitle: string
  readonly emptyDescription: string
}) {
  if (fetchError) {
    return (
      <Callout
        tone="critical"
        icon={<AlertTriangle aria-hidden className="size-5 text-[var(--color-negative)]" />}
        title="Không lấy được danh sách bài đăng"
      >
        <p>{fetchError}</p>
      </Callout>
    )
  }

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <Card className="flex flex-col divide-y divide-[var(--color-rule)] overflow-hidden p-0">
      {items.map((item, index) => (
        <DialogRoot key={index}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-[var(--color-paper-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              <span
                data-numeric
                className="w-5 shrink-0 text-[length:var(--text-sm)] font-semibold text-[var(--color-ink-3)]"
              >
                {index + 1}
              </span>
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="size-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
                />
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-paper-3)]">
                  <ImageOff aria-hidden className="size-4 text-[var(--color-ink-3)]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[length:var(--text-sm)] text-[var(--color-ink)]"
                  title={item.title}
                >
                  {item.title}
                </p>
                {item.createdAt ? (
                  <p className="mt-0.5 text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
                    {formatDate(item.createdAt.slice(0, 10))}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {item.metrics.map((metric, metricIndex) => (
                  <span
                    key={metricIndex}
                    data-numeric
                    className="flex items-center gap-1 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]"
                  >
                    <metric.icon aria-hidden className="size-3.5 text-[var(--color-ink-3)]" />
                    {formatCompact(metric.value)}
                  </span>
                ))}
              </div>
            </button>
          </DialogTrigger>

          <MetaPostDetailDialog post={item} />
        </DialogRoot>
      ))}
    </Card>
  )
}
