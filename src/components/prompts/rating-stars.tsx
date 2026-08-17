'use client'

import { useState, useTransition } from 'react'
import { Star } from 'lucide-react'
import { ratePromptRunAction } from '@/lib/actions/prompts'

/* Hallmark · component: rating-stars · theme: studied-DNA (Ink & Signal)
 *
 * Chấm điểm ngay tại chỗ (không phải form riêng) — người dùng vừa đọc xong
 * kết quả chạy thử, việc chấm chỉ nên tốn một cú bấm. Cập nhật lạc quan rồi
 * gọi `ratePromptRunAction` chạy nền; sai thì trả lại điểm cũ.
 */
export function RatingStars({
  runId,
  rating,
}: {
  readonly runId: string
  readonly rating: 1 | 2 | 3 | 4 | 5 | null
}) {
  const [current, setCurrent] = useState(rating)
  const [pending, startTransition] = useTransition()

  const handleRate = (value: 1 | 2 | 3 | 4 | 5) => {
    const previous = current
    setCurrent(value)
    startTransition(async () => {
      try {
        await ratePromptRunAction(runId, value)
      } catch {
        setCurrent(previous)
      }
    })
  }

  return (
    <span className="inline-flex items-center gap-0.5" aria-disabled={pending || undefined}>
      {([1, 2, 3, 4, 5] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => handleRate(value)}
          disabled={pending}
          aria-label={`Chấm ${value} trên 5`}
          className="p-0.5 disabled:cursor-not-allowed"
        >
          <Star
            aria-hidden
            className={
              current !== null && value <= current
                ? 'size-3 fill-[var(--color-caution)] text-[var(--color-caution)]'
                : 'size-3 text-[var(--color-ink-3)]'
            }
          />
        </button>
      ))}
      <span className="sr-only">
        {current === null ? 'Chưa chấm điểm' : `Đã chấm ${current} trên 5`}
      </span>
    </span>
  )
}
