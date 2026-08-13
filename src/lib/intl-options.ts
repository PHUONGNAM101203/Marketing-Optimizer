/**
 * Danh sách ĐẦY ĐỦ đơn vị tiền tệ (ISO 4217) và múi giờ (IANA tz database)
 * trên thế giới — cho dropdown chọn tay khi tự phát hiện từ nội dung site
 * thất bại (xem `audit/apply-market.ts`). Lấy thẳng từ `Intl`, KHÔNG hard-code
 * một danh sách tĩnh: đây là dữ liệu chuẩn ICU có sẵn trong runtime, luôn
 * đúng, không tốn một lượt gọi mạng nào, và không cần thêm thư viện ngoài.
 */

export interface CurrencyOption {
  readonly code: string
  readonly label: string
}

export interface TimezoneOption {
  readonly id: string
  readonly label: string
}

let cachedCurrencyOptions: readonly CurrencyOption[] | null = null

export const listCurrencyOptions = (): readonly CurrencyOption[] => {
  if (cachedCurrencyOptions) return cachedCurrencyOptions
  const names = new Intl.DisplayNames(['vi'], { type: 'currency' })
  cachedCurrencyOptions = Intl.supportedValuesOf('currency')
    .map((code) => ({ code, label: `${code} — ${names.of(code) ?? code}` }))
    .sort((a, b) => a.code.localeCompare(b.code))
  return cachedCurrencyOptions
}

let cachedTimezoneOptions: readonly TimezoneOption[] | null = null

export const listTimezoneOptions = (): readonly TimezoneOption[] => {
  if (cachedTimezoneOptions) return cachedTimezoneOptions
  const now = new Date()
  cachedTimezoneOptions = Intl.supportedValuesOf('timeZone')
    .map((id) => {
      const offset =
        new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: 'shortOffset' })
          .formatToParts(now)
          .find((part) => part.type === 'timeZoneName')?.value ?? ''
      return { id, label: `${id.replace(/_/g, ' ')} (${offset})` }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  return cachedTimezoneOptions
}
