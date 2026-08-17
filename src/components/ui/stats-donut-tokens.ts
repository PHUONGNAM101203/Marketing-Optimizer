/** Ba token màu SẴN CÓ trong `tokens.css` (không phải slot `--color-series-N`
 * dành riêng cho provider, xem CLAUDE.md "không đổi/gán lại các slot đó") —
 * đủ tương phản để phân biệt tối đa 3 lát bánh, không cần thêm màu mới ngoài
 * hệ token hiện có.
 *
 * TÁCH RIÊNG khỏi `stats-donut.tsx` (file KHÔNG có `'use client'`) — lý do
 * KHÔNG phải sở thích tổ chức file: `stats-donut.tsx` có `'use client'`, mà
 * mọi caller hiện tại (`meta-stats-summary.tsx`, `video-stats-summary.tsx`)
 * đều là Server Component (không `'use client'`). Next.js App Router chỉ
 * proxy đúng COMPONENT export qua ranh giới client — một hằng số/giá trị
 * thường (như mảng này) export từ file `'use client'` mà bị Server Component
 * import thẳng sẽ resolve thành `undefined` lúc chạy thật trên server (build
 * và `tsc` không báo lỗi vì kiểu vẫn khớp, chỉ runtime mới sai) — đây CHÍNH
 * XÁC là nguyên nhân bug "donut đen thui": `colorToken` đến tay `<Cell fill>`
 * là `undefined`, `fill="var(undefined)"` là CSS không hợp lệ nên trình
 * duyệt rơi về đen mặc định. Đặt hằng số này ở một module THƯỜNG (không
 * `'use client'`) thì Server Component import thẳng vẫn ra đúng giá trị,
 * còn `stats-donut.tsx` (client) import lại từ đây cũng an toàn — chiều
 * ngược lại (client import từ module thường) không có vấn đề gì. */
export const STATS_DONUT_COLOR_TOKENS = ['--color-signal', '--color-positive', '--color-caution'] as const

export interface StatsDonutSlice {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly colorToken: (typeof STATS_DONUT_COLOR_TOKENS)[number]
}
