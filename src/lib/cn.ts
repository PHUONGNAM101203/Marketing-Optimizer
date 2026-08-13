import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Gộp class, lớp sau thắng lớp trước khi cùng nhóm tiện ích Tailwind.
 *
 * ⚠ QUY ƯỚC BẮT BUỘC — CỠ CHỮ PHẢI CÓ TIỀN TỐ `length:`
 *
 *   ĐÚNG:  text-[length:var(--text-sm)]   +  text-[var(--color-ink)]
 *   SAI:   text-[var(--text-sm)]          +  text-[var(--color-ink)]
 *
 * `twMerge` không nhìn được vào bên trong `var()`, nên nó coi hai class
 * `text-[...]` bất kỳ là cùng một nhóm và CHỈ GIỮ CÁI SAU. Viết sai thì màu chữ
 * bị cỡ chữ nuốt mất một cách âm thầm — class vẫn có trong mã nguồn nhưng không
 * bao giờ tới được DOM.
 *
 * Lỗi này đã xảy ra thật: nút chính render chữ mực trên nền mực, tỉ lệ tương
 * phản 1,1:1, hoàn toàn không đọc được — mà TypeScript, ESLint và `next build`
 * đều báo xanh.
 */
export const cn = (...inputs: readonly ClassValue[]): string => twMerge(clsx(inputs))
