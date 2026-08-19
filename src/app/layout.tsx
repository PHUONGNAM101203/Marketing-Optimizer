import type { Metadata } from 'next'
import { Be_Vietnam_Pro, Inter } from 'next/font/google'
import './globals.css'
import { ThemeScript } from '@/components/layout/theme-script'
import { SidebarScript } from '@/components/layout/sidebar-script'

/**
 * Be Vietnam Pro is a static family — weights must be declared explicitly.
 * The `vietnamese` subset is the whole reason this face is here: it carries
 * the stacked diacritics (ế ộ ữ ẫ) that general-purpose display faces collide
 * with the cap-height at 36px and above.
 */
const display = Be_Vietnam_Pro({
  variable: '--font-display-loaded',
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

/** Inter is variable — no weight array. Carries body copy and every number. */
const body = Inter({
  variable: '--font-body-loaded',
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Marketing Optimizer',
    template: '%s · Marketing Optimizer',
  },
  description:
    'Trung tâm điều hành marketing: hợp nhất số liệu Google, Meta, TikTok và YouTube quanh một website.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="vi"
      className={`${display.variable} ${body.variable} h-full antialiased`}
      // Thuộc tính `data-theme` do ThemeScript ghi trước khi React chạy, nên
      // React không quản nó và không có chuyện lệch hydrate.
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        <SidebarScript />
      </head>
      {/* suppressHydrationWarning: một số tiện ích mở rộng trình duyệt (vd.
          ColorZilla) tự chèn thuộc tính như `cz-shortcut-listen` vào <body>
          trước khi React hydrate — không phải lỗi trong code này, nhưng
          React vẫn cảnh báo lệch hydrate nếu không khai báo trước. */}
      <body className="min-h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
