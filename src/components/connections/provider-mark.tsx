import {
  BarChart3,
  Camera,
  Music2,
  Newspaper,
  Play,
  Search,
  Megaphone,
  ShoppingBag,
  Tags,
  Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ProviderId } from '@/lib/domain/providers'
import { PROVIDER_META } from '@/lib/domain/providers'

/**
 * Dấu nhận diện nền tảng.
 *
 * Cố ý KHÔNG vẽ lại logo thương hiệu: logo là nhãn hiệu đã đăng ký, và logo vẽ
 * tay bao giờ cũng lệch bản gốc đủ để trông rẻ tiền. Một icon chức năng trung
 * tính cộng với tên viết đủ đọc tốt hơn — người dùng nhận ra "Google Ads" qua
 * chữ, không qua hình.
 *
 * Cũng bỏ luôn mô-típ icon-trong-ô-vuông-nền-xanh của bản Stitch gốc: nó lặp
 * hơn mười lần trên bốn màn hình mà không thêm một thông tin nào.
 */

const PROVIDER_ICON: Readonly<Record<ProviderId, LucideIcon>> = {
  'google-ads': Target,
  ga4: BarChart3,
  gsc: Search,
  gtm: Tags,
  youtube: Play,
  'merchant-center': ShoppingBag,
  'meta-ads': Megaphone,
  instagram: Camera,
  tiktok: Music2,
  facebook: Newspaper,
}

export interface ProviderMarkProps {
  readonly provider: ProviderId
  readonly size?: 'sm' | 'md'
  readonly className?: string
}

export function ProviderMark({ provider, size = 'md', className }: ProviderMarkProps) {
  const Icon = PROVIDER_ICON[provider]

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        size === 'sm' ? 'size-4' : 'size-5',
        className,
      )}
      style={{ color: `var(${PROVIDER_META[provider].colorToken})` }}
    >
      <Icon className={size === 'sm' ? 'size-4' : 'size-5'} />
    </span>
  )
}
