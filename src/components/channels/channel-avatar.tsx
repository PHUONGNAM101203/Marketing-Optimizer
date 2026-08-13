import { cn } from '@/lib/cn'
import { ProviderMark } from '@/components/connections/provider-mark'
import type { ProviderId } from '@/lib/domain/providers'

/**
 * Ảnh đại diện KÊNH THẬT (avatar YouTube/TikTok/Instagram/Facebook của chính
 * tài khoản đã kết nối) — khác `ProviderMark` (icon trung tính đại diện cho
 * CẢ NỀN TẢNG, không đổi theo từng tài khoản). Dùng ProviderMark làm placeholder
 * khi chưa có avatar (nền tảng không có khái niệm avatar, hoặc chưa lưu được).
 */
const SIZE_CLASS = {
  sm: 'size-6',
  md: 'size-9',
  lg: 'size-12',
} as const

export function ChannelAvatar({
  avatarUrl,
  provider,
  size = 'md',
  className,
}: {
  readonly avatarUrl: string | null | undefined
  readonly provider: ProviderId
  readonly size?: keyof typeof SIZE_CLASS
  readonly className?: string
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={cn('shrink-0 rounded-full object-cover', SIZE_CLASS[size], className)}
      />
    )
  }

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-[var(--color-paper-3)]',
        SIZE_CLASS[size],
        className,
      )}
    >
      <ProviderMark provider={provider} size={size === 'lg' ? 'md' : 'sm'} />
    </span>
  )
}
