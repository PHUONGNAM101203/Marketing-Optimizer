import { AlertTriangle, ImageOff } from 'lucide-react'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { MetaPostDetailDialog } from './meta-post-detail-dialog'
import { cn } from '@/lib/cn'
import { formatCompact, formatDate } from '@/lib/format'
import type { Eye } from 'lucide-react'

export interface MetaPostMetric {
  readonly icon: typeof Eye
  readonly label: string
  readonly value: number
}

export interface MetaPostItem {
  readonly title: string
  readonly thumbnailUrl: string | null
  readonly createdAt: string | null
  readonly permalinkUrl: string | null
  readonly metrics: readonly MetaPostMetric[]
}

/* Hallmark · component: meta-post-list · theme: studied-DNA (Ink & Signal)
 *
 * Lưới thẻ (không phải danh sách hàng ngang) — theo quyết định của người
 * dùng, cùng ngôn ngữ hình ảnh với `VideoCardGrid` cũ (ảnh lớn trên, caption
 * + số liệu dưới). Dùng chung cho Facebook và Instagram, cả tab Tổng quan
 * lẫn 2 widget xếp hạng ở Dashboard — component không biết gì về nền tảng,
 * chỉ nhận sẵn `metrics` (2 mục cho Instagram, 3 cho Facebook) đã chuẩn bị ở
 * nơi gọi. Không có số thứ hạng trên thẻ — thứ tự đọc trái-qua-phải,
 * trên-xuống đã ngầm thể hiện xếp hạng, giống quy ước của `VideoCardGrid`.
 */
export function MetaPostList({
  posts,
  fetchError,
  emptyDescription,
}: {
  readonly posts: readonly MetaPostItem[]
  readonly fetchError: string | null
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

  if (posts.length === 0) {
    return <EmptyState title="Chưa có bài đăng" description={emptyDescription} />
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post, index) => (
        <DialogRoot key={index}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-rule)] bg-[var(--color-paper)] text-left transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-[var(--color-paper-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              {post.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.thumbnailUrl} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-[var(--color-paper-3)]">
                  <ImageOff aria-hidden className="size-6 text-[var(--color-ink-3)]" />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p
                  className="line-clamp-2 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]"
                  title={post.title}
                >
                  {post.title}
                </p>
                {post.createdAt ? (
                  <p className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
                    {formatDate(post.createdAt.slice(0, 10))}
                  </p>
                ) : null}
                <div
                  className={cn(
                    'mt-auto grid gap-2 pt-2',
                    post.metrics.length >= 3 ? 'grid-cols-3' : 'grid-cols-2',
                  )}
                >
                  {post.metrics.map((metric, metricIndex) => (
                    <span
                      key={metricIndex}
                      className="flex items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--color-ink-2)]"
                    >
                      <metric.icon aria-hidden className="size-3.5 shrink-0 text-[var(--color-ink-3)]" />
                      <span data-numeric className="font-medium text-[var(--color-ink)]">
                        {formatCompact(metric.value)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </button>
          </DialogTrigger>

          <MetaPostDetailDialog post={post} />
        </DialogRoot>
      ))}
    </div>
  )
}
