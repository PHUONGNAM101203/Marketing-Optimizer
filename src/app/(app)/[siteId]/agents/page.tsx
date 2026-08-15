import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Bot, Clock, Lock, ShieldAlert } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { Card, SectionHead } from '@/components/ui/card'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { ProviderMark } from '@/components/connections/provider-mark'
import { NewAgentDialog } from '@/components/agents/new-agent-dialog'
import { ApprovalActions } from '@/components/agents/approval-actions'
import { getSite } from '@/lib/data/sites'
import { getLatestAuditRun } from '@/lib/data/audit'
import { listAgents, listPendingActionsForSite, listRunsForSite } from '@/lib/data/agents'
import { listPrompts } from '@/lib/data/prompts'
import { suggestAgentRoles } from '@/lib/audit/agent-suggestions'
import { ACTION_KIND_LABELS } from '@/lib/domain/insight'
import {
  AGENT_ROLE_LABELS,
  CADENCE_LABELS,
  RUN_STATUS_LABELS,
  isWriteTool,
  type Agent,
  type AgentRun,
  type AgentRunStatus,
  type PendingAction,
} from '@/lib/domain/agent'
import { formatNumber, formatRelativeTime } from '@/lib/format'

export const metadata = { title: 'Agents' }

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

export default async function AgentsPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>
}) {
  const { siteId } = await params
  const site = await getSite(siteId)
  if (!site) notFound()

  const [agents, runs, pending, prompts, auditRun] = await Promise.all([
    listAgents(site.id),
    listRunsForSite(site.id),
    listPendingActionsForSite(site.id),
    listPrompts(site.id),
    getLatestAuditRun(site.id),
  ])

  const now = new Date()
  const configuredRoles = new Set(agents.map((agent) => agent.role))
  const agentSuggestions = auditRun?.siteProfile
    ? suggestAgentRoles(auditRun.siteProfile).filter((suggestion) => !configuredRoles.has(suggestion.role))
    : []

  // Chỉ những hành động CHƯA có quyết định mới thuộc hàng đợi "Cần bạn quyết"
  // — `listPendingActionsForSite` trả về mọi hành động của Site kể cả đã
  // duyệt/từ chối trước đó (lịch sử), nên phải lọc lại ở đây.
  const awaitingApproval = pending.filter((action) => action.decision === null)
  const runsById = new Map(runs.map((run) => [run.id, run] as const))

  return (
    <PageShell>
      <PageHeader
        title="Agents"
        description="Agent chạy tác vụ nhiều bước trên dữ liệu của Site theo lịch. Chúng tự chạy được mọi thao tác ĐỌC — nhưng không thao tác GHI nào."
        action={
          <NewAgentDialog
            siteId={site.id}
            prompts={prompts.map((prompt) => ({ id: prompt.id, name: prompt.name }))}
          />
        }
      />

      <DataGate
        siteId={site.id}
        title="Agent chưa có gì để đọc"
        description="Agent chạy trên số liệu của Site. Chưa có nguồn nào thì chúng không có việc để làm."
      >

      {/* Bất biến an toàn nói thẳng ra ngay đầu trang, không giấu trong tài liệu. */}
      <Callout
        tone="signal"
        icon={<Lock aria-hidden className="size-5 text-[var(--color-signal)]" />}
        title="Agent không bao giờ tự tiêu tiền của bạn"
      >
        <p>
          Mọi hành động ghi ra nền tảng ngoài — đổi ngân sách, bật tắt chiến dịch, sửa
          nội dung quảng cáo — đều dừng lại chờ bạn duyệt. Không có chế độ nào, không có
          cờ cấu hình nào bỏ qua được cổng này.
        </p>
      </Callout>

      {agentSuggestions.length > 0 ? (
        <Callout
          tone="caution"
          icon={<Bot aria-hidden className="size-5 text-[var(--color-caution)]" />}
          title={`Gợi ý theo lĩnh vực đã nhận diện: ${auditRun?.siteProfile?.category}`}
        >
          <ul className="flex flex-col gap-2">
            {agentSuggestions.map((suggestion) => (
              <li key={suggestion.role} className="flex items-start gap-2">
                <Badge tone="outline" className="mt-0.5 shrink-0">
                  {AGENT_ROLE_LABELS[suggestion.role]}
                </Badge>
                <span className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
                  {suggestion.reason}
                </span>
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {awaitingApproval.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHead
            label="Cần bạn quyết"
            title={`${awaitingApproval.length} hành động đang chờ duyệt`}
            description="Agent đã phân tích xong và dừng lại ở đây. Chưa có gì được gửi đi."
          />
          <div className="flex flex-col gap-3">
            {awaitingApproval.map((action) => (
              <ApprovalCard
                key={action.id}
                action={action}
                siteId={site.id}
                agentId={runsById.get(action.runId)?.agentId ?? null}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <SectionHead label="Đội hình" title="Agent đã cấu hình" />

        <div className="grid gap-3 lg:grid-cols-2">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} siteId={site.id} now={now} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHead label="Nhật ký" title="Lượt chạy gần đây" />

        <Card>
          {runs.length === 0 ? (
            <EmptyState
              title="Chưa có lượt chạy nào"
              description="Agent sẽ chạy theo lịch đã đặt, hoặc bạn có thể chạy thủ công."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-rule)]">
              {runs.map((run) => (
                <RunRow key={run.id} run={run} agents={agents} now={now} />
              ))}
            </ul>
          )}
        </Card>
      </section>
      </DataGate>
    </PageShell>
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

function AgentCard({
  agent,
  siteId,
  now,
}: {
  readonly agent: Agent
  readonly siteId: string
  readonly now: Date
}) {
  const writeTools = agent.tools.filter(
    (tool) => tool.enabled && isWriteTool(tool.name),
  )

  return (
    <Card tone={agent.enabled ? 'bordered' : 'inset'} className="flex h-full flex-col">
      <Link
        href={`/${siteId}/agents/${agent.id}`}
        className="group flex h-full flex-col gap-3 rounded-[var(--radius-lg)] p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
              {AGENT_ROLE_LABELS[agent.role]}
            </p>
            <p className="mt-1 truncate text-[length:var(--text-base)] font-medium text-[var(--color-ink)]">
              {agent.name}
            </p>
          </div>
          <ArrowRight
            aria-hidden
            className="size-4 shrink-0 text-[var(--color-ink-3)] transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5"
          />
        </div>

        <p className="max-w-prose text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          {agent.description}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--color-rule)] pt-3">
          <Badge
            tone={agent.enabled ? 'positive' : 'neutral'}
            icon={<StatusDot tone={agent.enabled ? 'positive' : 'neutral'} />}
          >
            {agent.enabled ? 'Đang bật' : 'Đã tắt'}
          </Badge>

          {agent.schedule ? (
            <Badge tone="outline" icon={<Clock aria-hidden className="size-3" />}>
              {CADENCE_LABELS[agent.schedule.cadence]} · {agent.schedule.hourOfDay}:00
            </Badge>
          ) : null}

          {writeTools.length > 0 ? (
            <Badge tone="caution" icon={<Lock aria-hidden className="size-3" />}>
              {writeTools.length} tool ghi · cần duyệt
            </Badge>
          ) : (
            <Badge tone="neutral">Chỉ đọc</Badge>
          )}

          <span className="ml-auto text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
            {formatRelativeTime(agent.lastRunAt, now)}
          </span>
        </div>
      </Link>
    </Card>
  )
}

function RunRow({
  run,
  agents,
  now,
}: {
  readonly run: AgentRun
  readonly agents: readonly Agent[]
  readonly now: Date
}) {
  const agent = agents.find((item) => item.id === run.agentId)

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <Badge tone={RUN_TONE[run.status]} icon={<StatusDot tone={RUN_TONE[run.status]} />}>
        {RUN_STATUS_LABELS[run.status]}
      </Badge>

      <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
        {agent?.name ?? run.agentId}
      </span>

      <span className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
        {run.summary}
      </span>

      <span
        data-numeric
        className="shrink-0 text-[length:var(--text-xs)] text-[var(--color-ink-3)]"
      >
        {run.tokensUsed === null ? '—' : `${formatNumber(run.tokensUsed)} token`}
      </span>

      <span className="shrink-0 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
        {formatRelativeTime(run.startedAt, now)}
      </span>
    </li>
  )
}
