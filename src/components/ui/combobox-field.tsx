'use client'

import { useId, useMemo, useState } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { inputClass } from './form-field'

/* Hallmark · component: combobox-field · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active · disabled · empty
 *
 * `<select>` không lọc được khi danh sách dài (model AI có thể lên tới hàng
 * chục cái) — combobox này thay bằng ô tìm kèm danh sách lọc trực tiếp, cùng
 * khuôn Popover-trên-nút-trigger đã dùng ở `date-picker-field.tsx`. Vẫn có
 * một input ẩn mang giá trị thật để hoạt động đúng trong
 * `<form action={...}>` của Server Action, giống hệt cách DatePickerField
 * làm — Popover chỉ là giao diện chọn giá trị, input ẩn mới là thứ submit.
 */

export interface ComboboxFieldProps {
  readonly id?: string
  readonly name: string
  readonly options: readonly string[]
  readonly value: string
  readonly onValueChange: (value: string) => void
  readonly placeholder?: string
  readonly required?: boolean
  readonly emptyLabel?: string
}

export function ComboboxField({
  id,
  name,
  options,
  value,
  onValueChange,
  placeholder = 'Chọn…',
  required,
  emptyLabel = 'Không tìm thấy kết quả.',
}: ComboboxFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return options
    return options.filter((option) => option.toLowerCase().includes(trimmed))
  }, [options, query])

  const handleOpenChange = (next: boolean): void => {
    setOpen(next)
    if (!next) setQuery('')
  }

  const handleSelect = (option: string): void => {
    onValueChange(option)
    setOpen(false)
    setQuery('')
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
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-[var(--color-ink-3)]" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 flex w-72 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-rule)] bg-[var(--color-paper)] shadow-[var(--shadow-lift)]"
        >
          <div className="flex items-center gap-2 border-b border-[var(--color-rule)] px-3 py-2">
            <Search aria-hidden className="size-4 shrink-0 text-[var(--color-ink-3)]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm model…"
              className="w-full bg-transparent text-[length:var(--text-sm)] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-3)]"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-[length:var(--text-sm)] text-[var(--color-ink-3)]">{emptyLabel}</p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[length:var(--text-sm)] text-[var(--color-ink)]',
                    'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-[var(--color-paper-3)]',
                  )}
                >
                  <Check
                    aria-hidden
                    className={cn(
                      'size-4 shrink-0 text-[var(--color-signal)]',
                      option === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{option}</span>
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
