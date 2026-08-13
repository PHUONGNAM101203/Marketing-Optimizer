'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink, TriangleAlert } from 'lucide-react'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'

/* Hallmark · component: bot-protection-guide · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active
 *
 * Chuỗi User-Agent PHẢI khớp CHÍNH XÁC với `lib/audit/crawler.ts::USER_AGENT`
 * — đây là giá trị duy nhất trong hướng dẫn này không phụ thuộc nhà cung cấp
 * WAF nào, nên là thứ chắc chắn đúng 100% để người dùng copy-paste. Các bước
 * thao tác trên dashboard Cloudflare có thể đổi giao diện theo thời gian —
 * nói rõ điều đó thay vì giả vờ chắc chắn hơn thực tế.
 */
const USER_AGENT = 'Marketing-Optimizer-Audit/1.0 (+https://github.com)'

const CLOUDFLARE_STEPS: readonly string[] = [
  'Đăng nhập dashboard.cloudflare.com, chọn đúng domain đang bị chặn.',
  'Ở menu trái, mở mục "Security" → bấm "Security rules" (đây là "Custom rules" cũ, Cloudflare đổi tên nhưng cùng một tính năng).',
  'Bấm "Create rule".',
  'Đặt tên rule, ví dụ "Cho phép Marketing Optimizer Audit".',
  'Ở điều kiện: chọn trường "User Agent" → toán tử "contains" → dán ĐÚNG chuỗi User-Agent bên dưới vào ô giá trị (không sửa, không thêm bớt ký tự).',
  'Ở phần Action, chọn "Skip" — Cloudflare hiện ra danh sách tick chọn cơ chế cần bỏ qua cho request khớp điều kiện trên. Tick vào mục có chữ "Bot Fight Mode" hoặc "Super Bot Fight Mode" (tuỳ mục nào site bạn đang bật) — không cần tick các mục khác.',
  'Bấm "Deploy" để rule có hiệu lực ngay, không cần chờ.',
]

export function BotProtectionGuide() {
  const [copied, setCopied] = useState(false)

  return (
    <DialogRoot>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-[length:var(--text-xs)] font-medium text-[var(--color-signal)] underline underline-offset-2 hover:text-[var(--color-ink)]"
        >
          Hướng dẫn cho phép hệ thống quét
        </button>
      </DialogTrigger>

      <DialogContent
        title="Cho phép Marketing Optimizer quét website"
        description="Website của bạn đang bật hệ thống chống bot, chặn cả những request hợp lệ như lượt quét kỹ thuật này. Cần thêm một ngoại lệ (allowlist) cho crawler của chúng tôi — đây là site của bạn, bạn toàn quyền cho phép."
      >
        <div className="mb-5 flex flex-col gap-1.5">
          <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
            User-Agent cần allowlist — dán đúng nguyên văn
          </p>
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-rule-strong)] bg-[var(--color-paper-2)] py-2 pr-2 pl-3.5">
            <code className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] text-[var(--color-ink)]">
              {USER_AGENT}
            </code>
            <button
              type="button"
              aria-label="Sao chép User-Agent"
              onClick={() => {
                void navigator.clipboard.writeText(USER_AGENT)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
              className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-ink-2)] hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]"
            >
              {copied ? (
                <Check aria-hidden className="size-4 text-[var(--color-positive)]" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
            </button>
          </div>
        </div>

        <p className="mb-2.5 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
          Nếu website dùng Cloudflare (phổ biến nhất)
        </p>
        <ol className="mb-4 flex flex-col gap-2.5">
          {CLOUDFLARE_STEPS.map((step, index) => (
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
          href="https://dash.cloudflare.com/"
          target="_blank"
          rel="noreferrer noopener"
          className="mb-4 inline-flex items-center gap-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-signal)] hover:underline"
        >
          Mở Cloudflare Dashboard
          <ExternalLink aria-hidden className="size-3.5" />
        </a>

        <p className="mb-2.5 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
          Dùng nhà cung cấp khác (Sucuri, AWS WAF, tường lửa của hosting…)
        </p>
        <p className="mb-4 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          Nguyên tắc giống nhau, chỉ khác giao diện: tìm mục &quot;Bot protection&quot;,
          &quot;WAF&quot; hoặc &quot;Firewall rules&quot; trong bảng điều khiển của nhà cung cấp, rồi
          thêm một ngoại lệ (allow/skip) cho đúng chuỗi User-Agent ở trên.
        </p>

        <p className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-caution-soft)] p-3 text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
          <TriangleAlert
            aria-hidden
            className="mt-0.5 size-3.5 shrink-0 text-[var(--color-caution)]"
          />
          Giao diện nhà cung cấp có thể thay đổi theo thời gian — nếu một bước không khớp
          với những gì bạn thấy, cứ tiếp tục dựa theo nguyên tắc chung (allowlist đúng
          User-Agent ở trên) hoặc liên hệ hỗ trợ để được xác nhận lại chính xác.
        </p>
      </DialogContent>
    </DialogRoot>
  )
}
