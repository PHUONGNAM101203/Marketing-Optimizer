'use server'

import { convertCurrency } from '@/lib/currency'

/** Gọi trực tiếp từ client component (không qua `<form>`) — Next.js cho phép
 * Server Action được gọi như một hàm async bình thường, không chỉ làm
 * `action=` của form. Dùng cho hiển thị quy đổi SỐNG khi người dùng gõ ngân
 * sách, không phải một thao tác ghi dữ liệu. */
export async function convertCurrencyAction(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): Promise<number | null> {
  if (!Number.isFinite(amount) || amount <= 0) return null
  return convertCurrency(amount, fromCurrency, toCurrency)
}
