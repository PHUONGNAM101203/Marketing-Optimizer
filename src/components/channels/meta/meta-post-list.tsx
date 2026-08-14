import { AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { MetaPostDetailDialog } from './meta-post-detail-dialog'
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
 * Dùng chung cho Facebook và Instagram, cả tab Tổng quan lẫn widget xếp
 * hạng ở Dashboard — component không biết gì về nền tảng, chỉ nhận sẵn
 * `metrics` (2 mục cho Instagram, 3 cho Facebook) đã được chuẩn bị ở nơi
 * gọi (channel-detail-body.tsx), giống cách `TiktokVideoRankingList` tách
 * dữ liệu khỏi hình dạng hiển thị — không phải component TikTok, cố tình
 * không tái dùng để không đụng file đã lên production (xem spec).
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
    <Card className="flex flex-col divide-y divide-[var(--color-rule)] overflow-hidden p-0">
      {posts.map((post, index) => (
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
              {post.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.thumbnailUrl}
                  alt=""
                  className="size-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
                />
              ) : (
                <div className="size-10 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-paper-3)]" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[length:var(--text-sm)] text-[var(--color-ink)]"
                  title={post.title}
                >
                  {post.title}
                </p>
                {post.createdAt ? (
                  <p className="mt-0.5 text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
                    {formatDate(post.createdAt.slice(0, 10))}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {post.metrics.map((metric, metricIndex) => (
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

          <MetaPostDetailDialog post={post} />
        </DialogRoot>
      ))}
    </Card>
  )
}
