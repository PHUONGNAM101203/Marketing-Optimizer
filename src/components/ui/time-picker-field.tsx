'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { addMinutes, format, startOfDay } from 'date-fns'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/cn'
import { inputClass } from './form-field'

/* Hallmark · component: time-picker-field · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active · disabled · loading · error · success
 *
 * Danh sách giờ dạng thẻ 24h ("13:30"), cuộn tay trong Radix Popover — không
 * dùng `<select>` mặc định của trình duyệt (không theo được theme). Bước mặc
 * định 15 phút cho ra 96 lựa chọn/ngày, đủ mịn cho lịch chiến dịch mà không
 * quá dài để cuộn.
 */

const TIME_FORMAT = 'HH:mm'

const buildTimeSlots = (stepMinutes: number): readonly string[] => {
  const dayStart = startOfDay(new Date())
  const count = Math.floor((24 * 60) / stepMinutes)
  return Array.from({ length: count }, (_, index) => format(addMinutes(dayStart, index * stepMinutes), TIME_FORMAT))
}

export interface TimePickerFieldProps {
  readonly id?: string
  readonly name: string
  readonly required?: boolean
  readonly defaultValue?: string
  readonly placeholder?: string
  /** Bước giữa hai mốc giờ liên tiếp, tính bằng phút. Mặc định 15. */
  readonly stepMinutes?: number
  readonly onValueChange?: (value: string) => void
}

export function TimePickerField({
  id,
  name,
  required,
  defaultValue,
  placeholder = 'Chọn giờ',
  stepMinutes = 15,
  onValueChange,
}: TimePickerFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(defaultValue ?? '')
  const listRef = useRef<HTMLDivElement>(null)
  const slots = useMemo(() => buildTimeSlots(stepMinutes), [stepMinutes])

  const handleSelect = (time: string): void => {
    setValue(time)
    onValueChange?.(time)
    setOpen(false)
  }

  const handleOpenChange = (next: boolean): void => {
    setOpen(next)
    if (!next) return
    // Cuộn mục đang chọn vào GIỮA danh sách ngay lúc mở — 96 lựa chọn/ngày là
    // quá dài để bắt người dùng tự dò nếu form đã có sẵn giá trị (vd. sửa lại
    // một mục đã tạo).
    requestAnimationFrame(() => {
      listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'center' })
    })
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <input type="hidden" id={inputId} name={name} value={value} required={required} readOnly />

      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            inputClass,
            'flex items-center justify-between gap-2 text-left',
            !value && 'text-[var(--color-ink-3)]',
          )}
        >
          {value || placeholder}
          <Clock aria-hidden className="size-4 shrink-0 text-[var(--color-ink-3)]" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 w-32 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-rule)] bg-[var(--color-paper)] shadow-[var(--shadow-lift)]"
        >
          <div ref={listRef} className="max-h-64 overflow-y-auto p-1.5 [scroll-snap-type:y_proximity]">
            {slots.map((slot) => {
              const isSelected = slot === value
              return (
                <button
                  key={slot}
                  type="button"
                  data-selected={isSelected}
                  onClick={() => handleSelect(slot)}
                  className={cn(
                    'block w-full rounded-[var(--radius-sm)] px-3 py-1.5 text-left text-[length:var(--text-sm)] [scroll-snap-align:center]',
                    'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
                    isSelected
                      ? 'bg-[var(--color-accent)] font-medium text-[var(--color-accent-ink)]'
                      : 'text-[var(--color-ink)] hover:bg-[var(--color-paper-3)]',
                  )}
                >
                  {slot}
                </button>
              )
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
