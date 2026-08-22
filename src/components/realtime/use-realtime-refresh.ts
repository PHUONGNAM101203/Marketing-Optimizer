'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface RealtimeRefreshOptions {
  /** Bảng trong schema `public` cần nghe. Phải nằm trong publication
   * `supabase_realtime` — xem migration `20260822000001`. */
  readonly table: string
  /** Bộ lọc phía server theo cú pháp Realtime, vd. `site_id=eq.<uuid>`. Lọc ở
   * đây chứ không lọc trong callback: tin nhắn không khớp thậm chí không được
   * gửi xuống trình duyệt, tiết kiệm hạn mức tin nhắn của gói. */
  readonly filter?: string
  /** Tắt hẳn subscription (vd. khi không có gì đang chạy để mà chờ). */
  readonly enabled?: boolean
  /** Lưới an toàn: vẫn `router.refresh()` mỗi ngần này mili-giây phòng khi
   * WebSocket rớt mà không kịp báo. Bỏ trống thì không có fallback. */
  readonly fallbackIntervalMs?: number
}

/**
 * Làm mới cây RSC của route hiện tại khi một hàng trong bảng được chỉ định
 * thay đổi, thay cho việc polling `router.refresh()` theo chu kỳ.
 *
 * Realtime của Supabase áp dụng RLS cho từng người đăng ký, nên hook này chỉ
 * nhận được thay đổi của những hàng mà chính người dùng đó vốn đã đọc được —
 * không nới thêm quyền gì so với việc tải trang bình thường.
 */
export function useRealtimeRefresh({
  table,
  filter,
  enabled = true,
  fallbackIntervalMs,
}: RealtimeRefreshOptions): void {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) return

    const supabase = createClient()
    // Tên kênh phải DUY NHẤT theo (bảng, bộ lọc): hai hook cùng trang dùng
    // trùng tên sẽ ghi đè nhau và chỉ một cái sống sót.
    const channel = supabase
      .channel(`refresh:${table}:${filter ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => router.refresh(),
      )
      .subscribe()

    const fallback = fallbackIntervalMs
      ? setInterval(() => router.refresh(), fallbackIntervalMs)
      : undefined

    return () => {
      if (fallback) clearInterval(fallback)
      // `removeChannel` vừa unsubscribe vừa đóng socket khi không còn kênh
      // nào — thiếu nó thì mỗi lần điều hướng lại bỏ lại một kênh sống, ăn
      // dần hạn mức kết nối đồng thời của gói.
      void supabase.removeChannel(channel)
    }
  }, [table, filter, enabled, fallbackIntervalMs, router])
}
