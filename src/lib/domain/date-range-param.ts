import { isDateRangePreset, type DateRangePreset } from './site'

/** Đọc `?range=` từ URL, sập về mặc định nếu thiếu hoặc không hợp lệ — dùng
 * chung ở mọi trang có bộ lọc khoảng ngày, để không lặp lại logic validate. */
export const parseRangeParam = (value: string | undefined): DateRangePreset =>
  value && isDateRangePreset(value) ? value : 'last-28'
