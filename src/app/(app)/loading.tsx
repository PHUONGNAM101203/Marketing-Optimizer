import { Skeleton } from '@/components/ui/feedback'

/**
 * Đặt ở đây (không phải trong `[siteId]/`) CỐ Ý — `[siteId]/layout.tsx` tự
 * fetch site/danh sách site/profile/connections (4 truy vấn song song) MỖI
 * KHI siteId đổi, vì bản thân nó nằm trong route segment động. Một
 * `loading.tsx` đặt CÙNG cấp với layout đó chỉ bọc `children` (trang con),
 * không bọc được chính layout — khi đổi site, layout vẫn chặn hiển thị tới
 * lúc xong, để lại trang CŨ đứng yên trên màn hình (đúng lỗi người dùng báo:
 * đổi site xong sidebar trống/đen, trang cũ kẹt lại). Đặt loading.tsx ở
 * `(app)/` — cấp CHA của `[siteId]/` — bọc được TOÀN BỘ cây (layout + page)
 * trong một Suspense boundary, nên chuyển site giờ hiện khung xương ngay lập
 * tức thay vì treo trang cũ.
 */
export default function AppLoading() {
  return (
    <div className="flex min-h-dvh">
      <div className="flex h-dvh w-[var(--rail-w)] shrink-0 flex-col gap-1 border-r border-[var(--color-rule)] p-3">
        <Skeleton className="mb-3 h-8 w-full" />
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
        <div className="mt-auto flex items-center gap-2.5 border-t border-[var(--color-rule)] pt-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <Skeleton className="h-4 flex-1" />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-rule)] px-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 flex-1 max-w-md" />
        </div>
        <main className="min-w-0 flex-1 p-6">
          <Skeleton className="mb-4 h-8 w-64" />
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        </main>
      </div>
    </div>
  )
}
