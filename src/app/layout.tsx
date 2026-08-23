import type { Metadata, Viewport } from 'next'
import { Be_Vietnam_Pro, Inter } from 'next/font/google'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
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

// `viewportFit: 'cover'` là điều kiện BẮT BUỘC để `env(safe-area-inset-*)`
// trả về giá trị khác 0 trên iOS (notch/Dynamic Island/home-indicator) —
// thiếu dòng này thì mọi `padding: env(...)` trong CSS chỉ là no-op. Topbar
// dính đỉnh (`sticky top-0`) và menu điều hướng trượt từ trái trên mobile
// (`MobileNavDrawer`) đều dựa vào biến này.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Màu thanh trạng thái/khung trình duyệt. Hai giá trị hex dưới đây là
  // `--color-paper` của tokens.css ở nhánh sáng và nhánh tối — meta tag không
  // đọc được biến CSS nên buộc phải ghi thẳng; đổi token thì phải đổi cả đây.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfcf9' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1014' },
  ],
}

export const metadata: Metadata = {
  title: {
    default: 'Marketing Optimizer',
    template: '%s · Marketing Optimizer',
  },
  description:
    'Trung tâm điều hành marketing: hợp nhất số liệu Google, Meta, TikTok và YouTube quanh một website.',
  // Thiếu khối này thì "Thêm vào màn hình chính" trên iOS chỉ tạo một shortcut
  // mở Safari KÈM thanh địa chỉ và thanh công cụ — không phải app toàn màn
  // hình. `capable: true` là thứ duy nhất iOS đọc để quyết định điều đó
  // (manifest `display: 'standalone'` chỉ Android nghe theo).
  //
  // `black-translucent` cho nội dung chạy dưới thanh trạng thái — chỉ an toàn
  // vì Topbar và MobileNavDrawer đã đệm `env(safe-area-inset-top)` sẵn (cùng
  // với `viewportFit: 'cover'` ở trên). Bỏ một trong ba thứ đó là tiêu đề
  // chui lên dưới đồng hồ/Dynamic Island.
  appleWebApp: {
    capable: true,
    title: 'Optimizer',
    statusBarStyle: 'black-translucent',
  },
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
        {/* Cả hai đều nằm trong hạn mức đã trả của gói Vercel Pro và tự tắt
            ngoài môi trường Vercel, nên chạy `next dev` không gửi gì đi đâu.
            SpeedInsights đo Core Web Vitals THẬT của người dùng — cách duy
            nhất kiểm chứng được việc chuyển vùng chạy hàm sang `sin1`
            (xem `vercel.json`) có thực sự nhanh hơn hay không, thay vì tin
            vào lý thuyết. */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
