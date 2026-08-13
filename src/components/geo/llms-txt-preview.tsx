'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * App này KHÔNG có quyền ghi vào server web của người dùng (đúng triết lý
 * "chỉ đọc" xuyên suốt cả app) — chỉ hiện nội dung để copy, không có nút
 * "Xuất bản" giả vờ làm được việc không làm được.
 */
export function LlmsTxtPreview({ content, domain }: { readonly content: string; readonly domain: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
          Dán nguyên văn vào <code>{domain}/llms.txt</code> trên server thật của bạn.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(content)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? (
            <Check aria-hidden className="size-3.5 text-[var(--color-positive)]" />
          ) : (
            <Copy aria-hidden className="size-3.5" />
          )}
          {copied ? 'Đã copy' : 'Copy nội dung'}
        </Button>
      </div>
      <pre className="max-h-72 overflow-auto rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-3 text-[length:var(--text-xs)] whitespace-pre-wrap text-[var(--color-ink-2)]">
        {content}
      </pre>
    </div>
  )
}
