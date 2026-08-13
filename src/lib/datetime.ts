/** Gộp ngày (yyyy-MM-dd, từ DatePickerField) + giờ (HH:mm, từ TimePickerField,
 * KHÔNG bắt buộc) thành một chuỗi ISO datetime gửi thẳng cho cột `timestamptz`.
 * Không có offset múi giờ — Postgres hiểu theo timezone của session (UTC),
 * cùng cách `deployments.scheduled_at` đã dùng từ trước, không phát minh quy
 * tắc quy đổi mới. Bỏ trống giờ mặc định về 00:00 — không bắt người dùng
 * chọn giờ nếu họ chỉ cần đúng ngày. */
export const combineDateTime = (date: string, time: string | undefined): string =>
  `${date}T${time?.trim() || '00:00'}:00`
