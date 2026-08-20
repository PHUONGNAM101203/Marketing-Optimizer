'use client'

import { useId, useState } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { DayPicker } from 'react-day-picker'
import { format, parse, isValid } from 'date-fns'
import { vi } from 'date-fns/locale'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/cn'
import { inputClass } from './form-field'

/* Hallmark · component: date-picker-field · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active · disabled · loading · error · success
 *
 * Thay `<input type="date">` mặc định của trình duyệt (giao diện hệ điều
 * hành, không theo được theme tối của app) bằng lịch dựng từ react-day-picker
 * (nền lịch, xử lý sẵn bàn phím/a11y) trong Radix Popover, style hoàn toàn
 * bằng token Hallmark qua `classNames`. Ngày giờ tính toán bằng date-fns —
 * không tự viết lại parse/format tay.
 *
 * Vẫn hoạt động đúng trong `<form action={...}>` của Server Action — một
 * input `hidden` mang giá trị ISO (yyyy-MM-dd) là thứ THẬT SỰ được submit,
 * lịch chỉ là giao diện chọn giá trị đó.
 */

const ISO_FORMAT = 'yyyy-MM-dd'

const toIsoDate = (date: Date): string => format(date, ISO_FORMAT)

const fromIsoDate = (value: string | undefined): Date | undefined => {
  if (!value) return undefined
  const parsed = parse(value, ISO_FORMAT, new Date())
  return isValid(parsed) ? parsed : undefined
}

// DayPicker gộp `classNames[UI.Day]` + classNames của MỖI modifier đang bật
// (today/selected/outside/disabled…) thành className của Ô LƯỚI `<td>`, KHÔNG
// phải của `<button>` bên trong nó (đã xác nhận qua mã nguồn DayPicker.js —
// `data-today`/`data-selected`/`aria-selected` cũng nằm trên `<td>`, không
// nằm trên button). Vì nút mới là thứ hiện màu, các state dưới đây phải style
// nút CON qua selector `[&_button]:...` thay vì đặt trực tiếp trên chính nó.
const dayButtonClass = cn(
  'flex size-9 items-center justify-center rounded-[var(--radius-sm)]',
  'text-[length:var(--text-sm)] text-[var(--color-ink)]',
  'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
  'hover:bg-[var(--color-paper-3)]',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
)

const navButtonClass = cn(
  'flex size-8 items-center justify-center rounded-[var(--radius-sm)]',
  'text-[var(--color-ink-2)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
  'hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
  'disabled:pointer-events-none disabled:opacity-30',
)

export interface DatePickerFieldProps {
  readonly id?: string
  readonly name: string
  readonly required?: boolean
  readonly defaultValue?: string
  readonly placeholder?: string
  /** ISO yyyy-MM-dd — chặn chọn ngày trước mốc này (vd. ngày kết thúc không
   * được trước ngày bắt đầu). */
  readonly minDate?: string
  /** Gọi lại kèm giá trị ISO mỗi khi đổi ngày — component cha dùng để hiện
   * thêm thông tin phụ thuộc ngày đã chọn (vd. giờ địa phương của site). */
  readonly onValueChange?: (value: string) => void
}

export function DatePickerField({
  id,
  name,
  required,
  defaultValue,
  placeholder = 'Chọn ngày',
  minDate,
  onValueChange,
}: DatePickerFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(defaultValue ?? '')
  const selected = fromIsoDate(value)
  const minDateValue = fromIsoDate(minDate)

  // Chỉ tính khi popover THẬT SỰ mở (calendar mount lúc đó, không phải lúc
  // SSR) nên không có rủi ro lệch giờ server/client — biên cho dropdown năm
  // quick-jump bên dưới, không giới hạn số liệu có thể chọn (chỉ giới hạn
  // danh sách năm hiện trong dropdown cho gọn thay vì cuộn vô hạn).
  const today = new Date()

  const handleSelect = (date: Date | undefined): void => {
    const next = date ? toIsoDate(date) : ''
    setValue(next)
    onValueChange?.(next)
    setOpen(false)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <input type="hidden" id={inputId} name={name} value={value} required={required} readOnly />

      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            inputClass,
            'flex items-center justify-between gap-2 text-left',
            !selected && 'text-[var(--color-ink-3)]',
          )}
        >
          <span className="min-w-0 truncate">
            {selected ? format(selected, 'd MMM yyyy', { locale: vi }) : placeholder}
          </span>
          <CalendarDays aria-hidden className="size-4 shrink-0 text-[var(--color-ink-3)]" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={16}
          className="z-50 max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3 shadow-[var(--shadow-lift)]"
        >
          <DayPicker
            mode="single"
            locale={vi}
            showOutsideDays
            selected={selected}
            defaultMonth={selected}
            onSelect={handleSelect}
            disabled={minDateValue ? { before: minDateValue } : undefined}
            // Nhãn "Tháng Tám 2026" tĩnh đổi thành 2 dropdown bấm-chọn-nhanh
            // riêng (tháng/năm) — react-day-picker v10 đã có sẵn chế độ này
            // (`captionLayout="dropdown"`, xem `MonthCaption`/`Dropdown` trong
            // node_modules), không cần tự dựng picker tháng/năm từ đầu.
            captionLayout="dropdown"
            startMonth={new Date(today.getFullYear() - 10, 0)}
            endMonth={new Date(today.getFullYear() + 5, 11)}
            classNames={{
              root: 'text-[var(--color-ink)]',
              // `relative` để `nav` (render TRƯỚC month, không lồng trong
              // month_caption — xem DayPicker.js) có chỗ định vị `absolute`
              // đúng ngay trên hàng caption, tạo thành MỘT hàng
              // mũi-tên–nhãn–mũi-tên duy nhất thay vì hai hàng chồng lệch.
              months: 'relative flex flex-col gap-3',
              month: 'flex flex-col gap-3',
              nav: 'absolute inset-x-0 top-0 z-10 flex items-center justify-between',
              month_caption: 'flex items-center justify-center px-9 py-1',
              caption_label:
                'flex items-center gap-1 rounded-[var(--radius-xs)] text-[length:var(--text-sm)] font-medium capitalize peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-focus)]',
              // Mỗi dropdown (tháng/năm) là một `<select>` VÔ HÌNH (`opacity-0`,
              // phủ kín `dropdown_root`) đè lên nhãn hiện chữ + mũi tên bên
              // dưới — giữ đúng `<select>` gốc để có picker gốc hệ điều hành/
              // bàn phím/a11y sẵn có, chỉ đổi phần NHÌN THẤY bằng token
              // Hallmark, không tự vẽ lại dropdown.
              dropdowns: 'flex items-center gap-1.5',
              dropdown_root:
                'relative inline-flex items-center rounded-[var(--radius-xs)] px-1.5 py-0.5 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-[var(--color-paper-3)]',
              dropdown: 'peer absolute inset-0 z-10 cursor-pointer appearance-none opacity-0',
              button_previous: navButtonClass,
              button_next: navButtonClass,
              chevron: 'size-4 fill-current',
              month_grid: 'border-collapse',
              weekdays: 'flex',
              weekday: 'size-9 text-center text-[length:var(--text-2xs)] font-medium text-[var(--color-ink-3)] uppercase',
              week: 'flex',
              day: 'p-0.5 text-center',
              day_button: dayButtonClass,
              today: '[&_button]:font-semibold [&_button]:text-[var(--color-signal)]',
              selected: cn(
                '[&_button]:bg-[var(--color-accent)] [&_button]:text-[var(--color-accent-ink)]',
                '[&_button:hover]:bg-[var(--color-accent-hover)]',
              ),
              outside: '[&_button]:text-[var(--color-ink-3)]',
              disabled: '[&_button]:pointer-events-none [&_button]:opacity-30',
            }}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
