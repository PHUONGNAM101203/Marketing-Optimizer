'use client'

import { ExternalLink } from 'lucide-react'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'

/* Hallmark · component: ads-developer-token-guide · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active
 *
 * Developer Token KHÔNG nằm trong OAuth app (Client ID/Secret) — nó xin ở một
 * nơi khác hẳn (Google Ads Manager), một lần cho mọi Site dùng chung. Gộp
 * chung vào hướng dẫn OAuth app sẽ khiến người đọc tưởng hai thứ là một.
 */
const STEPS: readonly string[] = [
  'Cần một tài khoản Google Ads Manager (MCC) — không phải tài khoản Ads thường. Chưa có thì tạo miễn phí tại ads.google.com/home/tools/manager-accounts.',
  'Đăng nhập MCC → bấm biểu tượng cờ lê "Tools & Settings" ở góc trên → mục Setup → API Center.',
  'Đồng ý Google Ads API Terms of Service nếu được hỏi.',
  'Điền form xin token: mô tả ngắn mục đích dùng (vd: "Quản lý báo cáo quảng cáo cho website của chính công ty"), phần "Đã có OAuth Client ID chưa" dán đúng Client ID đã tạo ở bước Thiết lập OAuth app phía trên.',
  'Google cấp ngay một "Test Developer Token" — token này CHỈ đọc được tài khoản Ads ở chế độ test, chưa dùng được với tài khoản thật.',
  'Muốn dùng với tài khoản Ads thật, bấm "Apply for Basic Access" ngay trong API Center — Google duyệt thủ công, thường vài ngày. Token không đổi, chỉ đổi mức truy cập sau khi duyệt.',
  'Copy chuỗi Developer Token, dán vào ô "Developer Token (Google Ads)" trong dialog Thiết lập OAuth app (cùng chỗ với Client ID/Secret) — không phải ở đây.',
]

export function AdsDeveloperTokenGuide() {
  return (
    <DialogRoot>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-[length:var(--text-xs)] font-medium text-[var(--color-signal)] underline underline-offset-2 hover:text-[var(--color-ink)]"
        >
          Hướng dẫn lấy Developer Token
        </button>
      </DialogTrigger>

      <DialogContent
        title="Lấy Developer Token cho Google Ads"
        description="Một token dùng chung cho MỌI tài khoản Google Ads bạn quản lý qua MCC — xin một lần, nhập một lần, không phải lặp lại theo từng Site."
      >
        <ol className="mb-5 flex flex-col gap-2.5">
          {STEPS.map((step, index) => (
            <li key={step} className="flex gap-2.5 text-[length:var(--text-sm)]">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-paper-3)] text-[length:var(--text-2xs)] font-semibold text-[var(--color-ink-2)]"
              >
                {index + 1}
              </span>
              <span className="text-[var(--color-ink-2)]">{step}</span>
            </li>
          ))}
        </ol>

        <a
          href="https://ads.google.com/home/tools/manager-accounts/"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-signal)] hover:underline"
        >
          Mở Google Ads Manager Accounts
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      </DialogContent>
    </DialogRoot>
  )
}
