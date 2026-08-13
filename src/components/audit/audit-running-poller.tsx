'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Quét giờ chạy NỀN, độc lập với tab trình duyệt (xem `lib/actions/audit.ts`)
 * — người dùng không còn cần tự bấm F5 để biết khi nào xong. Tự làm mới
 * trang định kỳ trong lúc `status === 'running'`, dừng ngay khi không còn.
 */
export function AuditRunningPoller({ isRunning }: { readonly isRunning: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(interval)
  }, [isRunning, router])

  return null
}
