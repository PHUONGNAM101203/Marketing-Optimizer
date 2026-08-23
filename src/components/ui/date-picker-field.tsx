'use client'

import { useId, useState } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { DayPicker } from 'react-day-picker'
import { addMonths, format, parse, isValid } from 'date-fns'
import { vi } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
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
  'mx-auto flex size-9 items-center justify-center rounded-[var(--radius-sm)]',
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

type CalendarView = 'days' | 'months' | 'decades' | 'years'

/** Gom [first..last] thành từng thập niên THẬT (2010-2019, 2020-2029…), cắt
 * hai đầu theo biên cho phép. Neo theo bội số 10 chứ không chia đều từ
 * `first`: người dùng nghĩ theo "những năm 2020", không phải theo một khoảng
 * 10 năm bắt đầu từ một mốc tuỳ tiện. Nhãn hiện đúng phần đã cắt (vd.
 * "2016-2019") thay vì "2010-2019" rồi bên trong lại thiếu năm — không mời
 * người dùng bấm vào thứ không chọn được. */
const decadeBuckets = (
  first: number,
  last: number,
): readonly { readonly start: number; readonly from: number; readonly to: number }[] => {
  const buckets = []
  for (let start = Math.floor(first / 10) * 10; start <= last; start += 10) {
    buckets.push({ start, from: Math.max(start, first), to: Math.min(start + 9, last) })
  }
  return buckets
}

const gridButtonClass = cn(
  'rounded-[var(--radius-sm)] px-2 py-2 text-[length:var(--text-sm)] text-[var(--color-ink)]',
  'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
  'hover:bg-[var(--color-paper-3)]',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
)

const captionButtonClass = cn(
  'flex items-center gap-1 rounded-[var(--radius-xs)] px-1.5 py-0.5',
  'text-[length:var(--text-sm)] font-medium capitalize text-[var(--color-ink)]',
  'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
  'hover:bg-[var(--color-paper-3)]',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
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
  /** 'days' | 'months' | 'years' — bấm nhãn tháng/năm ở header đổi sang lưới
   * tương ứng, chọn xong quay lại 'days'. */
  const [view, setView] = useState<CalendarView>('days')
  /** Thập niên đang mở ở lưới 'years'. Chỉ có nghĩa khi `view === 'years'`. */
  const [decadeStart, setDecadeStart] = useState(0)
  const selected = fromIsoDate(value)
  const minDateValue = fromIsoDate(minDate)

  // Chỉ tính khi popover THẬT SỰ mở (calendar mount lúc đó, không phải lúc
  // SSR) nên không có rủi ro lệch giờ server/client — biên cho dropdown năm
  // quick-jump bên dưới, không giới hạn số liệu có thể chọn (chỉ giới hạn
  // danh sách năm hiện trong dropdown cho gọn thay vì cuộn vô hạn).
  const today = new Date()
  const [month, setMonth] = useState<Date>(() => selected ?? new Date())
  // 6 thập niên TRỌN VẸN, neo vào bội số 10 quanh năm hiện tại (2026 -> 1980
  // đến 2039). Hai điều kiện này quyết định cách chia lưới bên dưới:
  //   - trọn vẹn: mỗi thập niên đủ 10 năm, nên lưới năm là 5 cột × 2 hàng
  //     KHÔNG dư ô nào;
  //   - 6 khoảng: lưới thập niên là 2 cột × 3 hàng, cũng không dư.
  // Bản trước lấy (hiện tại-10 .. +5) = 16 năm, ra 3 khoảng lẻ nên hàng cuối
  // của lưới thập niên trống một nửa — đúng chỗ "thừa khoảng trống không đều".
  const firstYear = Math.floor((today.getFullYear() - 40) / 10) * 10
  const lastYear = firstYear + 59

  /** Mở lại popover là quay về lưới ngày và nhảy tới tháng đang chọn — không
   * để lại lưới tháng/năm của lần mở trước, người dùng mở ra là muốn chọn
   * NGÀY chứ không phải tiếp tục thao tác dở dang từ trước đó. */
  const handleOpenChange = (next: boolean): void => {
    setOpen(next)
    if (next) {
      setView('days')
      setMonth(selected ?? new Date())
    }
  }

  const handleSelect = (date: Date | undefined): void => {
    const next = date ? toIsoDate(date) : ''
    setValue(next)
    onValueChange?.(next)
    setOpen(false)
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
          // `--radix-popover-trigger-width` do Radix đo ô kích hoạt rồi
          // đặt lên content. Không có nó, lịch rộng theo nội dung (7 × 40px =
          // 280px) và luôn hụt so với ô chọn ngày phía trên, để lại một mảng
          // trống lệch bên phải. `min-w` giữ sàn 280px cho trường hợp ô kích
          // hoạt hẹp hơn thế (vd. lưới 2 cột trong dialog so sánh kỳ) — hẹp
          // hơn nữa thì ô ngày co dưới 36px, chạm ngưỡng vùng bấm.
          className="z-50 w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] min-w-[17.5rem] rounded-[var(--radius-lg)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3 shadow-[var(--shadow-lift)]"
        >
          <div className="flex w-full flex-col gap-3">
            {/* Header TỰ DỰNG, thay cho caption + nav của react-day-picker
                (đã ẩn bằng `classNames` bên dưới).

                Vì sao bỏ `captionLayout="dropdown"`: chế độ đó dựng hai
                `<select>` gốc. Mà lý do cả component này tồn tại — xem header
                file — chính là `<input type="date">` gốc "không theo được
                theme tối của app". `<select>` gốc dính đúng vấn đề đó: danh
                sách do hệ điều hành vẽ, không nhận token Hallmark nào. Dựng
                lưới tháng/năm ngay trong lịch vừa nhất quán với lý do đó, vừa
                cho thấy trọn 12 tháng / 16 năm trong một lần nhìn thay vì một
                danh sách phải cuộn. */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Tháng trước"
                className={cn(navButtonClass, view === 'days' ? '' : 'invisible')}
                onClick={() => setMonth(addMonths(month, -1))}
                disabled={view !== 'days'}
              >
                <ChevronLeft aria-hidden className="size-4" />
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className={captionButtonClass}
                  aria-expanded={view === 'months'}
                  onClick={() => setView(view === 'months' ? 'days' : 'months')}
                >
                  {format(month, 'LLLL', { locale: vi })}
                </button>

                <button
                  type="button"
                  className={captionButtonClass}
                  aria-expanded={view === 'years' || view === 'decades'}
                  onClick={() => setView(view === 'days' ? 'decades' : 'days')}
                >
                  {month.getFullYear()}
                </button>
              </div>

              <button
                type="button"
                aria-label="Tháng sau"
                className={cn(navButtonClass, view === 'days' ? '' : 'invisible')}
                onClick={() => setMonth(addMonths(month, 1))}
                disabled={view !== 'days'}
              >
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </div>

            {view === 'months' ? (
              <div className="grid grid-cols-3 gap-1">
                {Array.from({ length: 12 }, (_, index) => {
                  const isCurrent = index === month.getMonth()
                  return (
                    <button
                      key={index}
                      type="button"
                      className={cn(
                        gridButtonClass,
                        'capitalize',
                        isCurrent &&
                          'bg-[var(--color-accent)] text-[var(--color-accent-ink)] hover:bg-[var(--color-accent-hover)]',
                      )}
                      onClick={() => {
                        setMonth(new Date(month.getFullYear(), index, 1))
                        setView('days')
                      }}
                    >
                      {format(new Date(2026, index, 1), 'LLL', { locale: vi })}
                    </button>
                  )
                })}
              </div>
            ) : null}

            {view === 'decades' ? (
              <div className="grid grid-cols-2 gap-1">
                {decadeBuckets(firstYear, lastYear).map((bucket) => {
                  const isCurrent =
                    month.getFullYear() >= bucket.from && month.getFullYear() <= bucket.to
                  return (
                    <button
                      key={bucket.start}
                      type="button"
                      data-numeric
                      className={cn(
                        gridButtonClass,
                        isCurrent &&
                          'bg-[var(--color-accent)] text-[var(--color-accent-ink)] hover:bg-[var(--color-accent-hover)]',
                      )}
                      onClick={() => {
                        setDecadeStart(bucket.start)
                        setView('years')
                      }}
                    >
                      {bucket.from}–{bucket.to}
                    </button>
                  )
                })}
              </div>
            ) : null}

            {view === 'years' ? (
              <div className="grid grid-cols-5 gap-1">
                {Array.from(
                  { length: Math.min(decadeStart + 9, lastYear) - Math.max(decadeStart, firstYear) + 1 },
                  (_, index) => {
                    const year = Math.max(decadeStart, firstYear) + index
                    const isCurrent = year === month.getFullYear()
                    return (
                      <button
                        key={year}
                        type="button"
                        data-numeric
                        className={cn(
                          gridButtonClass,
                          isCurrent &&
                            'bg-[var(--color-accent)] text-[var(--color-accent-ink)] hover:bg-[var(--color-accent-hover)]',
                        )}
                        onClick={() => {
                          setMonth(new Date(year, month.getMonth(), 1))
                          setView('days')
                        }}
                      >
                        {year}
                      </button>
                    )
                  },
                )}
              </div>
            ) : null}

            {view === 'days' ? (
            <DayPicker
              mode="single"
              locale={vi}
              showOutsideDays
              selected={selected}
              month={month}
              onMonthChange={setMonth}
              onSelect={handleSelect}
              disabled={minDateValue ? { before: minDateValue } : undefined}
              startMonth={new Date(firstYear, 0)}
              endMonth={new Date(lastYear, 11)}
              classNames={{
                root: 'text-[var(--color-ink)]',
                months: 'flex flex-col',
                month: 'flex flex-col',
                // Header tự dựng ở trên đã thay cả hai — xem chú thích ở đó.
                month_caption: 'hidden',
                nav: 'hidden',
                // KHÔNG ép `display:flex` lên `<tr>` (`weekdays`/`week`).
                // `month_grid` là một `<table>` thật; để nguyên mô hình bảng thì
                // `<th>` và `<td>` CÙNG MỘT CỘT tự động chung bề rộng. Ép flex
                // là bỏ mô hình đó đi, mỗi hàng tự co giãn độc lập — và hai hàng
                // vốn KHÔNG bằng nhau: ô ngày là `p-0.5` (2px mỗi bên) + nút
                // `size-9` (36px) = 40px, còn ô thứ chỉ `size-9` = 36px. Lệch
                // 4px mỗi cột, dồn 7 cột thành 28px, đúng như hàng "TH 2…CN"
                // ngắn hụt so với lưới ngày bên dưới.
                //
                // Sửa bằng cách bỏ flex chứ không phải bằng cách chỉnh 36px
                // thành 40px: căn cột khi đó do bảng bảo đảm, không phụ thuộc
                // hai con số ở hai dòng khác nhau phải luôn khớp tay.
                month_grid: 'w-full table-fixed border-collapse',
                weekday:
                  'h-9 text-center align-middle text-[length:var(--text-2xs)] font-medium text-[var(--color-ink-3)] uppercase',
                day: 'p-0.5 text-center',
                day_button: dayButtonClass,
                // Hôm nay: vòng tròn viền signal, KHÔNG chỉ đổi màu chữ —
                // chữ tím trên nền sáng ở cỡ 14px là một điểm nhấn quá nhẹ,
                // mắt lướt qua không bắt được đâu là hôm nay.
                //
                // `:not([data-selected])` vì khi hôm nay ĐANG được chọn thì
                // nút đã có nền accent đặc rồi; chồng thêm vòng viền tím
                // quanh nền đặc là hai tín hiệu đánh nhau, không phải nhấn
                // mạnh hơn. `data-selected` nằm trên `<td>` — xem chú thích ở
                // `dayButtonClass`.
                today: cn(
                  '[&_button]:font-semibold',
                  '[&:not([data-selected])_button]:rounded-full',
                  '[&:not([data-selected])_button]:text-[var(--color-signal)]',
                  '[&:not([data-selected])_button]:ring-1',
                  '[&:not([data-selected])_button]:ring-[var(--color-signal)]',
                ),
                selected: cn(
                  '[&_button]:bg-[var(--color-accent)] [&_button]:text-[var(--color-accent-ink)]',
                  '[&_button:hover]:bg-[var(--color-accent-hover)]',
                ),
                outside: '[&_button]:text-[var(--color-ink-3)]',
                disabled: '[&_button]:pointer-events-none [&_button]:opacity-30',
              }}
            />
            ) : null}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
