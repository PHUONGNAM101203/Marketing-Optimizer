import { ExternalLink } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { externalAccountUrl } from '@/lib/domain/external-links'
import type { ProviderId } from '@/lib/domain/providers'

/**
 * Nút mở THẲNG tài khoản thật trên nền tảng gốc, tab mới — xem lý do ở
 * `lib/domain/external-links.ts`. Tự ẩn khi nền tảng chưa deep-link được,
 * không hiện một nút chết.
 */
export function ExternalChannelLink({
  provider,
  externalAccountId,
  size = 'sm',
  variant = 'secondary',
  label = 'Mở kênh',
}: {
  readonly provider: ProviderId
  readonly externalAccountId: string
  readonly size?: ButtonProps['size']
  readonly variant?: ButtonProps['variant']
  readonly label?: string
}) {
  const url = externalAccountUrl(provider, externalAccountId)
  if (!url) return null

  return (
    <Button asChild variant={variant} size={size}>
      <a href={url} target="_blank" rel="noreferrer">
        <ExternalLink aria-hidden className="size-3.5" />
        {label}
      </a>
    </Button>
  )
}
