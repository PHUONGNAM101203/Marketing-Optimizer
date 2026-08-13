'use client'

import { useEffect, useState } from 'react'
import { convertCurrencyAction } from '@/lib/actions/currency'

/** Quy đổi SỐNG cạnh ô nhập ngân sách — vd. "25 USD ≈ 650.000 ₫". Ẩn hẳn khi
 * đơn vị site đã LÀ VND (không có gì để quy đổi) hoặc chưa nhập số/API lỗi —
 * không hiện một con số sai lệch hay số 0 giả. */
export function CurrencyConversionHint({
  amount,
  fromCurrency,
}: {
  readonly amount: number
  readonly fromCurrency: string
}) {
  const isConvertible = fromCurrency.toUpperCase() !== 'VND' && Number.isFinite(amount) && amount > 0
  const [converted, setConverted] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Không có gì để quy đổi — bỏ qua hẳn, không cần đưa `converted`/`loading`
    // về giá trị rỗng vì phần hiển thị bên dưới đã ẩn hoàn toàn khi
    // `!isConvertible`, trạng thái cũ còn lại không bao giờ hiện ra.
    if (!isConvertible) return
    let cancelled = false
    // Bật cờ "đang tải" ngay khi bắt đầu một lượt fetch mới — đúng mẫu
    // "subscribe rồi setState khi có kết quả" mà react.dev khuyến nghị,
    // chỉ khác là setState ĐẦU TIÊN đến ngay lúc bắt đầu (không phải lúc có
    // kết quả) để UI biết một lượt quy đổi mới đang chạy.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    // Giãn 400ms — tránh gọi API mỗi phím gõ.
    const timeout = setTimeout(() => {
      void convertCurrencyAction(amount, fromCurrency, 'VND').then((result) => {
        if (cancelled) return
        setConverted(result)
        setLoading(false)
      })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [amount, fromCurrency, isConvertible])

  if (!isConvertible) return null

  return (
    <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
      {loading
        ? 'Đang quy đổi…'
        : converted !== null
          ? `≈ ${new Intl.NumberFormat('vi-VN').format(converted)} ₫`
          : 'Không quy đổi được lúc này'}
    </p>
  )
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

const localTimeFormatter = (timezone: string): Intl.DateTimeFormat => {
  const cached = formatterCache.get(timezone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  })
  formatterCache.set(timezone, formatter)
  return formatter
}

/** Ngày giờ THẬT ngay lúc này ở múi giờ của site — không suy diễn "ngày đã
 * chọn quy đổi sang giờ đó" (một ngày lịch không có giờ để quy đổi, suy diễn
 * kiểu đó dễ bịa ra một mốc giờ không có thật). Đây là bối cảnh thời gian
 * thật của thị trường mục tiêu, hiện cạnh lịch để người lên kế hoạch biết họ
 * đang lệch múi giờ bao nhiêu so với nơi đó. */
export function LocalTimeHint({ timezone }: { readonly timezone: string }) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    // Phát hiện mount phía CLIENT có chủ đích: `new Date()` phải KHÔNG chạy
    // lúc render server (sẽ lệch giờ thật + gây hydration mismatch giữa
    // server/client). State rỗng lúc render đầu (khớp cả server lẫn client),
    // chỉ điền giá trị thật sau khi đã mount — đúng mẫu Next.js khuyến nghị
    // cho giá trị chỉ có nghĩa phía client (giờ hệ thống, kích thước cửa sổ…).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date())
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  if (!now || timezone === 'Asia/Ho_Chi_Minh') return null

  const cityLabel = timezone.split('/').pop()?.replace(/_/g, ' ') ?? timezone

  return (
    <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
      Hiện tại ở {cityLabel}: {localTimeFormatter(timezone).format(now)}
    </p>
  )
}
