import {
  Bot,
  CalendarRange,
  Compass,
  FileText,
  Lightbulb,
  LayoutGrid,
  Plug,
  ScanSearch,
  Settings,
  Sparkles,
  SquareTerminal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Cấu hình điều hướng.
 *
 * Bản Stitch tham chiếu có HAI nav cùng làm điều hướng chính — side rail và tab
 * ngang trên đầu — nên người dùng không biết mình đang ở đâu trong cây. Ở đây
 * chỉ có một: side rail. Topbar mang ngữ cảnh (Site nào, khoảng ngày nào, ai
 * đang đăng nhập), không mang đích đến.
 */

export interface NavItem {
  readonly href: string
  readonly label: string
  readonly icon: LucideIcon
  /** Khớp cả route con: /channels/google-ads vẫn làm sáng mục "Kênh". */
  readonly matchPrefix?: boolean
}

export interface NavSection {
  readonly label: string | null
  readonly items: readonly NavItem[]
}

export const buildNavSections = (siteId: string): readonly NavSection[] => {
  const base = `/${siteId}`

  return [
    {
      label: 'Phân tích',
      items: [
        { href: `${base}/overview`, label: 'Tổng quan', icon: LayoutGrid },
        {
          href: `${base}/channels`,
          label: 'Kênh',
          icon: Compass,
          matchPrefix: true,
        },
        { href: `${base}/explore`, label: 'Khám phá', icon: SquareTerminal },
      ],
    },
    {
      label: 'Tối ưu',
      items: [
        { href: `${base}/insights`, label: 'Đề xuất', icon: Lightbulb },
        { href: `${base}/ai-visibility`, label: 'Hiện diện AI', icon: Sparkles },
        { href: `${base}/audit`, label: 'Kiểm tra SEO/GEO/AIO', icon: ScanSearch },
        { href: `${base}/planner`, label: 'Kế hoạch', icon: CalendarRange },
      ],
    },
    {
      label: 'Tự động',
      items: [
        { href: `${base}/agents`, label: 'Agents', icon: Bot, matchPrefix: true },
        { href: `${base}/prompts`, label: 'Prompt Studio', icon: FileText },
      ],
    },
    {
      label: null,
      items: [
        { href: `${base}/connections`, label: 'Kết nối', icon: Plug },
        { href: `${base}/settings`, label: 'Cài đặt', icon: Settings },
      ],
    },
  ]
}

export const isNavItemActive = (item: NavItem, pathname: string): boolean =>
  item.matchPrefix ? pathname.startsWith(item.href) : pathname === item.href
