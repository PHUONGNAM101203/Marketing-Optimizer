import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Clock, Lock, Play, Unlock } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { Card, CardBody, CardHeader, SectionHead } from '@/components/ui/card'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getSite } from '@/lib/data/sites'
import { MOCK_AGENTS, findAgent, runsOfAgent } from '@/mock/agents'
import { MOCK_TODAY } from '@/mock/dates'
import {
  AGENT_ROLE_LABELS,
  CADENCE_LABELS,
  RUN_STATUS_LABELS,
  isWriteTool,
  type AgentRun,
  type AgentRunStatus,
  type AgentStep,
} from '@/lib/domain/agent'
import { formatNumber, formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/cn'

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly agentId: string }>
}) {
  const { agentId } = await params
  return { title: findAgent(agentId)?.name ?? 'Agent' }
}

const RUN_TONE: Readonly<
  Record<AgentRunStatus, 'positive' | 'negative' | 'caution' | 'neutral' | 'signal'>
> = {
  queued: 'neutral',
  running: 'signal',
  'pending-approval': 'caution',
  succeeded: 'positive',
  failed: 'negative',
  cancelled: 'neutral',
  rejected: 'neutral',
}

const STEP_LABELS: Readonly<Record<AgentStep['kind'], string>> = {
  thought: 'Suy luận',
  'tool-call': 'Gọi tool',
  'tool-result': 'Kết quả',
  output: 'Kết luận',
}

export default async function AgentDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string; readonly agentId: string }>
}) {
  const { siteId, agentId } = await params
  const site = await getSite(siteId)
  const agent = findAgent(agentId)
  if (!site || !agent) notFound()

  const runs = runsOfAgent(agent.id)
  const readTools = agent.tools.filter((tool) => !isWriteTool(tool.name))
  const writeTools = agent.tools.filter((tool) => isWriteTool(tool.name))

  return (
    <PageShell>
      <div>
        <Link
          href={`/${site.id}/agents`}
          className="mb-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] text-[length:var(--text-sm)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          <ChevronLeft aria-hidden className="size-4" />
          Tất cả agent
        </Link>

        <PageHeader
          title={agent.name}
          description={agent.description}
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="outline">{AGENT_ROLE_LABELS[agent.role]}</Badge>
              <Badge
                tone={agent.enabled ? 'positive' : 'neutral'}
                icon={<StatusDot tone={agent.enabled ? 'positive' : 'neutral'} />}
              >
                {agent.enabled ? 'Đang bật' : 'Đã tắt'}
              </Badge>
              {agent.schedule ? (
                <Badge tone="neutral" icon={<Clock aria-hidden className="size-3" />}>
                  {CADENCE_LABELS[agent.schedule.cadence]} · {agent.schedule.hourOfDay}:00
                </Badge>
              ) : null}
            </div>
          }
          action={
            <Button variant="primary" size="md">
              <Play aria-hidden className="size-4" />
              Chạy ngay
            </Button>
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-4">
          <SectionHead
            label="Nhật ký"
            title="Lượt chạy"
            description="Từng bước agent đã làm, kể cả suy luận — không có hộp đen."
          />

          <div className="flex flex-col gap-3">
            {runs.map((run) => (
              <RunDetail key={run.id} run={run} now={MOCK_TODAY} />
            ))}
          </div>
        </section>

        <aside className="flex flex-col gap-5">
          {/* Tool tách hai nhóm rõ ràng. Người dùng phải thấy ngay agent này
              chạm được vào cái gì, và cái gì cần họ gật đầu. */}
          <Card>
            <CardHeader
              title="Tool được phép dùng"
              description="Nhóm đọc chạy tự động. Nhóm ghi luôn dừng chờ duyệt."
              ruled
            />
            <CardBody className="pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
                <Unlock aria-hidden className="size-3" />
                Đọc — tự chạy
              </p>
              <ul className="mb-5 flex flex-wrap gap-1.5">
                {readTools.map((tool) => (
                  <li key={tool.name}>
                    <Badge tone={tool.enabled ? 'neutral' : 'outline'}>
                      {tool.name}
                      {!tool.enabled ? ' · tắt' : ''}
                    </Badge>
                  </li>
                ))}
              </ul>

              <p className="mb-2 flex items-center gap-1.5 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-caution)] uppercase">
                <Lock aria-hidden className="size-3" />
                Ghi — cần duyệt
              </p>
              {writeTools.length === 0 ? (
                <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
                  Agent này không có tool ghi nào. Nó không thể thay đổi bất cứ thứ gì
                  trên các nền tảng.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {writeTools.map((tool) => (
                    <li key={tool.name}>
                      <Badge tone={tool.enabled ? 'caution' : 'outline'}>
                        {tool.name}
                        {!tool.enabled ? ' · tắt' : ''}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Prompt điều khiển" ruled />
            <CardBody className="pt-4">
              <Link
                href={`/${site.id}/prompts`}
                className="text-[length:var(--text-sm)] text-[var(--color-signal)] hover:underline"
              >
                {agent.promptId}
              </Link>
              <p className="mt-2 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
                Prompt nằm trong Prompt Studio, có phiên bản và lịch sử sửa — không chôn
                trong mã nguồn.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </PageShell>
  )
}

function RunDetail({ run, now }: { readonly run: AgentRun; readonly now: Date }) {
  return (
    <Card tone={run.status === 'pending-approval' ? 'inset' : 'bordered'}>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Badge
              tone={RUN_TONE[run.status]}
              icon={<StatusDot tone={RUN_TONE[run.status]} />}
            >
              {RUN_STATUS_LABELS[run.status]}
            </Badge>
            <span className="text-[length:var(--text-sm)] font-normal text-[var(--color-ink-2)]">
              {run.trigger === 'schedule'
                ? 'Theo lịch'
                : run.trigger === 'manual'
                  ? 'Chạy tay'
                  : 'Theo sự kiện'}{' '}
              · {formatRelativeTime(run.startedAt, now)}
            </span>
          </span>
        }
        description={run.summary ?? undefined}
        action={
          <span
            data-numeric
            className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]"
          >
            {run.tokensUsed === null ? '—' : `${formatNumber(run.tokensUsed)} token`}
          </span>
        }
        ruled
      />

      <CardBody className="pt-4">
        <ol className="flex flex-col gap-3">
          {run.steps.map((step) => (
            <li key={step.index} className="flex gap-3">
              <span
                className={cn(
                  'mt-0.5 shrink-0 rounded-[var(--radius-xs)] px-1.5 py-0.5',
                  'text-[length:var(--text-2xs)] font-medium',
                  step.kind === 'tool-call' || step.kind === 'tool-result'
                    ? 'bg-[var(--color-signal-soft)] text-[var(--color-signal)]'
                    : 'bg-[var(--color-paper-3)] text-[var(--color-ink-2)]',
                )}
              >
                {STEP_LABELS[step.kind]}
              </span>
              <p
                className={cn(
                  'min-w-0 text-[length:var(--text-sm)]',
                  step.kind === 'tool-call'
                    ? 'font-[family-name:var(--font-numeric)] break-all text-[var(--color-ink-2)]'
                    : 'text-[var(--color-ink)]',
                )}
              >
                {step.content}
              </p>
            </li>
          ))}
        </ol>

        {run.pendingActions.length > 0 ? (
          <p className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-caution)]/25 bg-[var(--color-caution-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]">
            <Lock aria-hidden className="mr-1.5 inline size-3.5" />
            Lượt chạy dừng tại đây. {run.pendingActions.length} hành động đang chờ duyệt —
            chưa có gì được gửi sang nền tảng.
          </p>
        ) : null}
      </CardBody>
    </Card>
  )
}
