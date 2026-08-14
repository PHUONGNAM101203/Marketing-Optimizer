import { ExternalLink, Eye, Heart, MessageCircle, Share2 } from 'lucide-react'
import { DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatCompact, formatDateTime } from '@/lib/format'
import type { TiktokVideoCardData } from './tiktok-video-grid'

/* Hallmark · component: tiktok-video-detail-dialog · theme: studied-DNA (Ink & Signal) */
export function TiktokVideoDetailDialog({ video }: { readonly video: TiktokVideoCardData }) {
  return (
    <DialogContent
      title={video.title}
      description={
        video.createdAt
          ? formatDateTime(video.createdAt, {
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
        {video.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.coverImageUrl}
            alt=""
            className="aspect-[9/16] max-h-80 w-auto self-center rounded-[var(--radius-md)] object-cover"
          />
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <DetailStat icon={Eye} label="Lượt xem" value={formatCompact(video.views)} />
          <DetailStat icon={Heart} label="Lượt thích" value={formatCompact(video.likes)} />
          <DetailStat icon={MessageCircle} label="Bình luận" value={formatCompact(video.comments)} />
          <DetailStat icon={Share2} label="Chia sẻ" value={formatCompact(video.shares)} />
        </div>

        {video.shareUrl ? (
          <Button asChild variant="secondary" size="md">
            <a href={video.shareUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden className="size-4" />
              Xem trên TikTok
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
  readonly icon: typeof Eye
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
