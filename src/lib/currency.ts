import 'server-only'

/**
 * Quy đổi tiền tệ — chỉ dùng để HIỂN THỊ tham khảo (vd. "≈ 650.000 ₫" cạnh ô
 * nhập ngân sách bằng USD), không dùng cho tính toán tài chính chính xác cao
 * (không cần thư viện toán tiền tệ như currency.js/dinero.js — VND không có
 * số lẻ, các đơn vị khác chỉ 2 số lẻ, một phép nhân + làm tròn là đủ).
 *
 * Nguồn tỷ giá: open.er-api.com — MIỄN PHÍ, không cần API key, có VND (nhiều
 * API miễn phí khác như frankfurter.app dùng tỷ giá ECB KHÔNG có VND). Cập
 * nhật mỗi ngày, đủ cho mục đích tham khảo — không phải giao dịch thật.
 * Dự phòng: fawazahmed0/exchange-api (CDN, cũng miễn phí, cũng có VND) nếu
 * nguồn chính lỗi.
 */

const PRIMARY_ENDPOINT = (base: string) => `https://open.er-api.com/v6/latest/${base}`
const FALLBACK_ENDPOINT = (base: string) =>
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base.toLowerCase()}.json`

// Tỷ giá chỉ cần mới trong ngày — cache 1 ngày để không gọi API mỗi lần
// render, vừa đỡ tải nguồn miễn phí vừa không có ý nghĩa gọi dày hơn tần suất
// cập nhật thật của nó.
const REVALIDATE_SECONDS = 60 * 60 * 24

interface PrimaryResponse {
  readonly result: string
  readonly rates: Readonly<Record<string, number>>
}

interface FallbackResponse {
  readonly [base: string]: Readonly<Record<string, number>>
}

/** `null` khi không lấy được tỷ giá — nơi gọi tự quyết định ẩn phần quy đổi
 * thay vì hiện một con số sai lệch hoặc bịa. */
export const getExchangeRate = async (fromCurrency: string, toCurrency: string): Promise<number | null> => {
  const from = fromCurrency.toUpperCase()
  const to = toCurrency.toUpperCase()
  if (from === to) return 1

  try {
    const response = await fetch(PRIMARY_ENDPOINT(from), { next: { revalidate: REVALIDATE_SECONDS } })
    if (response.ok) {
      const body = (await response.json()) as PrimaryResponse
      const rate = body.result === 'success' ? body.rates[to] : undefined
      if (typeof rate === 'number') return rate
    }
  } catch {
    // Rơi xuống nguồn dự phòng bên dưới.
  }

  try {
    const response = await fetch(FALLBACK_ENDPOINT(from), { next: { revalidate: REVALIDATE_SECONDS } })
    if (!response.ok) return null
    const body = (await response.json()) as FallbackResponse
    const rate = body[from.toLowerCase()]?.[to.toLowerCase()]
    return typeof rate === 'number' ? rate : null
  } catch {
    return null
  }
}

/** Quy đổi thẳng một số tiền — làm tròn theo quy ước hiển thị của đơn vị
 * đích (VND không lẻ, hầu hết đơn vị khác 2 số lẻ). `null` khi không lấy
 * được tỷ giá. */
export const convertCurrency = async (
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): Promise<number | null> => {
  const rate = await getExchangeRate(fromCurrency, toCurrency)
  if (rate === null) return null
  const converted = amount * rate
  return toCurrency.toUpperCase() === 'VND' ? Math.round(converted) : Math.round(converted * 100) / 100
}
