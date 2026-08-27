'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

/* Hallmark · component: image-with-fallback · theme: studied-DNA (Ink & Signal)
 *
 * Ảnh có ảnh dự phòng cho CẢ HAI trường hợp hỏng: không có URL, và có URL
 * nhưng tải không được.
 *
 * Vì sao cần: mọi chỗ hiển thị ảnh trong app đều đã tự viết nhánh `url ? <img>
 * : <dự phòng>`, nhưng nhánh đó chỉ bắt được trường hợp URL là null. URL trỏ
 * tới ảnh đã chết vẫn render một thẻ `<img>` vỡ. Đó không phải giả thiết: ngày
 * 27/8/2026 cả bốn ảnh đại diện kênh đang lưu đều trả HTTP 403, và thumbnail
 * TikTok thì hỏng dần theo thời gian vì URL có chữ ký.
 *
 * Nhớ URL nào hỏng chứ không nhớ một cờ boolean: các danh sách này render lại
 * với dữ liệu khác mỗi khi đổi khoảng ngày, mà một cờ boolean sẽ giữ nguyên
 * trạng thái "hỏng" và che luôn ảnh mới hoàn toàn tải được. So sánh với `src`
 * hiện tại tự khỏi lại khi URL đổi, không cần `useEffect` (repo cấm đặt state
 * trong effect — xem `explore-prefs.ts`) và cũng không cần `key` ở nơi gọi.
 */
export function ImageWithFallback({
  src,
  fallback,
  className,
  alt = '',
}: {
  readonly src: string | null | undefined
  /** Hiện thay cho ảnh khi không có URL hoặc tải hỏng. */
  readonly fallback: ReactNode
  readonly className?: string
  readonly alt?: string
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (!src || failedSrc === src) return <>{fallback}</>

  return (
    // Chỗ DUY NHẤT trong app tắt luật này. `next/image` cần cấu hình
    // `remotePatterns` cho từng CDN và tính vào hạn mức tối ưu ảnh của Vercel —
    // xem ghi chú ở `site-favicon.tsx` trước khi đổi.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailedSrc(src)}
    />
  )
}
