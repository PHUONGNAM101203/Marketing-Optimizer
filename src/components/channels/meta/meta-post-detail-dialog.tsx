import { ExternalLink } from 'lucide-react'
import { DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { formatCompact, formatDateTime } from '@/lib/format'
import type { MetaPostItem } from './meta-post-list'

/* Hallmark · component: meta-post-detail-dialog · theme: studied-DNA (Ink & Signal) */
export function MetaPostDetailDialog({ post }: { readonly post: MetaPostItem }) {
  return (
    <DialogContent
      title="Chi tiết bài đăng"
      description={
        post.createdAt
          ? formatDateTime(post.createdAt, {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {post.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnailUrl}
            alt=""
            loading="lazy"
            className="max-h-80 w-full rounded-[var(--radius-md)] object-cover"
          />
        ) : null}

        <p className="text-[length:var(--text-sm)] text-[var(--color-ink)]">{post.title}</p>

        <div className={cn('grid gap-3', post.metrics.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
          {post.metrics.map((metric, index) => (
            <DetailStat
              key={index}
              icon={metric.icon}
              label={metric.label}
              value={formatCompact(metric.value)}
            />
          ))}
        </div>

        {post.permalinkUrl ? (
          <Button asChild variant="secondary" size="md">
            <a href={post.permalinkUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden className="size-4" />
              Xem bài đăng gốc
            </a>
          </Button>
        ) : null}
      </div>
    </DialogContent>
  )
}

function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  readonly icon: MetaPostItem['metrics'][number]['icon']
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-rule)] px-3 py-2.5">
      <Icon aria-hidden className="size-4 shrink-0 text-[var(--color-ink-3)]" />
      <div className="min-w-0">
        <p data-numeric className="text-[length:var(--text-lg)] font-semibold text-[var(--color-ink)]">
          {value}
        </p>
        <p className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">{label}</p>
      </div>
    </div>
  )
}
