'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { Card, SectionHead } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProviderMark } from '@/components/connections/provider-mark'
import { ApprovalActions } from '@/components/agents/approval-actions'
import { ACTION_KIND_LABELS } from '@/lib/domain/insight'
import type { PendingAction } from '@/lib/domain/agent'

/* Hallmark · component: approval-queue · theme: studied-DNA (Ink & Signal)
 *
 * `items` được CHỤP MỘT LẦN khi mount (`useState(initialActions)`, không phải
 * `useEffect` đồng bộ lại theo prop mới) — cố ý không theo props mới nhất từ
 * server sau mỗi lần render lại.
 *
 * Lý do: `approvePendingActionAction`/`rejectPendingActionAction` gọi
 * `revalidatePath`, và Next tự làm mới toàn bộ cây RSC của route này ngay khi
 * Server Action đó hoàn tất — kể cả khi action được gọi trực tiếp từ client
 * (không qua `<form>`). Việc làm mới này xảy ra TRONG CÙNG `startTransition`
 * với lượt `setState` cục bộ báo "đã quyết" ở `ApprovalActions`. Nếu danh sách
 * này lọc lại theo props mới nhất (`decision === null`) mỗi lần render, hàng
 * vừa duyệt có thể unmount ngay trong cùng một commit React — TRƯỚC khi badge
 * "Đã duyệt · chờ triển khai ghi thật" kịp vẽ ra màn hình. Người dùng bấm
 * Duyệt xong thấy hàng biến mất im lặng thay vì xác nhận rõ ràng.
 *
 * Giữ một bản chụp cục bộ đảm bảo hàng luôn còn trong cây cho tới khi trang
 * được tải lại thật sự (điều hướng mới / F5) — cùng kiểu "eventually
 * consistent" mà `runAgentNowAction` đã chấp nhận (xem comment ở đó). Đánh đổi:
 * một hành động chờ duyệt MỚI xuất hiện từ agent khác trong lúc người dùng
 * đang đứng ở trang này sẽ không hiện cho tới lần tải lại kế tiếp.
 */
export function ApprovalQueue({
  siteId,
  initialActions,
  agentIdByRunId,
}: {
  readonly siteId: string
  readonly initialActions: readonly PendingAction[]
  readonly agentIdByRunId: Readonly<Record<string, string>>
}) {
  const [items] = useState(initialActions)

  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        label="Cần bạn quyết"
        title={`${items.length} hành động đang chờ duyệt`}
        description="Agent đã phân tích xong và dừng lại ở đây. Chưa có gì được gửi đi."
      />
      <div className="flex flex-col gap-3">
        {items.map((action) => (
          <ApprovalCard
            key={action.id}
            action={action}
            siteId={siteId}
            agentId={agentIdByRunId[action.runId] ?? null}
          />
        ))}
      </div>
    </section>
  )
}

function ApprovalCard({
  action,
  siteId,
  agentId,
}: {
  readonly action: PendingAction
  readonly siteId: string
  readonly agentId: string | null
}) {
  return (
    <Card tone="bordered" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="caution" icon={<ShieldAlert aria-hidden className="size-3" />}>
              Chờ duyệt
            </Badge>
            <Badge tone="outline">{ACTION_KIND_LABELS[action.actionKind]}</Badge>
            <span className="inline-flex items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
              <ProviderMark provider={action.provider} size="sm" />
              {action.targetEntityName}
            </span>
          </div>

          <p className="text-[length:var(--text-base)] font-medium text-[var(--color-ink)]">
            {action.summary}
          </p>
        </div>
      </div>

      {/* Diff trước → sau: người duyệt phải thấy CHÍNH XÁC cái gì sẽ đổi, chứ
          không phải một câu tóm tắt do mô hình viết. */}
      <dl className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-rule)]">
        {action.diff.map((row, index) => (
          <div
            key={row.field}
            className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 px-3 py-2 text-[length:var(--text-sm)] ${
              index > 0 ? 'border-t border-[var(--color-rule)]' : ''
            }`}
          >
            <dt className="truncate text-[var(--color-ink-2)]">{row.field}</dt>
            <dd data-numeric className="truncate text-[var(--color-ink-3)] line-through">
              {row.before}
            </dd>
            <dd data-numeric className="truncate font-medium text-[var(--color-ink)]">
              {row.after}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 max-w-prose text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
        {action.rationale}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--color-rule)] pt-4">
        <ApprovalActions siteId={siteId} actionId={action.id} />
        {agentId ? (
          <Button asChild variant="ghost" size="md">
            <Link href={`/${siteId}/agents/${agentId}`}>Xem toàn bộ lượt chạy</Link>
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
