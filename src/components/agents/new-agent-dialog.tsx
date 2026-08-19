'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { Bot, Check, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import { cn } from '@/lib/cn'
import { createAgentAction } from '@/lib/actions/agents'
import {
  AGENT_ROLE_LABELS,
  CADENCE_LABELS,
  type AgentRole,
  type AgentSchedule,
  type AgentTool,
  type AgentToolName,
  type ReadToolName,
  type WriteToolName,
} from '@/lib/domain/agent'
import { PROVIDERS, PROVIDER_META, type ProviderId } from '@/lib/domain/providers'

// Khớp CHÍNH XÁC `ReadToolName`/`WriteToolName` ở `domain/agent.ts` — đây là
// registry tool hữu hạn thật sự chạy được ở `run-agent.ts` (Task 13), không
// phải danh sách tự nghĩ ra cho form.
const READ_TOOL_NAMES: readonly ReadToolName[] = [
  'query-metrics',
  'list-entities',
  'compare-periods',
  'fetch-page-content',
  'check-ai-citation',
  'read-search-queries',
]

const WRITE_TOOL_NAMES: readonly WriteToolName[] = [
  'apply-budget-change',
  'pause-campaign',
  'resume-campaign',
  'update-ad-copy',
  'add-negative-keyword',
  'publish-report',
]

interface ToolChoice {
  readonly checked: boolean
  readonly provider: ProviderId | ''
}

type ToolSelection = Readonly<Record<AgentToolName, ToolChoice>>

const EMPTY_TOOL_SELECTION: ToolSelection = Object.fromEntries(
  [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES].map((name) => [name, { checked: false, provider: '' }]),
) as ToolSelection

/* Hallmark · component: new-agent-dialog · theme: studied-DNA (Ink & Signal)
 *
 * Chọn tool ở đây chỉ quyết định agent có ĐỀ XUẤT hành động đó hay không —
 * bất biến an toàn của module (agent.ts) vẫn đứng: mọi tool GHI luôn dừng ở
 * `pending-approval`, không có cờ nào trong form này bỏ qua được cổng duyệt.
 */
export function NewAgentDialog({
  siteId,
  prompts,
}: {
  readonly siteId: string
  readonly prompts: readonly { readonly id: string; readonly name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [tools, setTools] = useState<ToolSelection>(EMPTY_TOOL_SELECTION)
  const [scheduled, setScheduled] = useState(true)

  const resetAndClose = () => {
    setTools(EMPTY_TOOL_SELECTION)
    setScheduled(true)
    setError(null)
    setOk(false)
    setOpen(false)
  }

  const toggleTool = (name: AgentToolName) =>
    setTools((prev) => ({ ...prev, [name]: { ...prev[name], checked: !prev[name].checked } }))

  const setToolProvider = (name: AgentToolName, provider: ProviderId | '') =>
    setTools((prev) => ({ ...prev, [name]: { ...prev[name], provider } }))

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('name') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()
    const role = String(formData.get('role') ?? 'seo-analyst') as AgentRole
    const promptId = String(formData.get('promptId') ?? '')
    const cadence = String(formData.get('cadence') ?? 'daily') as AgentSchedule['cadence']
    // Cron `api/cron/sync-hourly/route.ts` chạy mỗi giờ và honor đúng
    // `hourOfDay` (theo múi giờ Site) cho mọi nhịp — khác bản cũ chỉ có 1
    // cron/ngày nên phải gán cứng giờ và giấu ô nhập.
    const hourOfDay = Math.min(23, Math.max(0, Number(formData.get('hourOfDay') ?? 7)))
    const dayOfWeek = cadence === 'weekly' ? Number(formData.get('dayOfWeek') ?? 1) : null

    const selectedTools: AgentTool[] = [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES]
      .filter((toolName) => tools[toolName].checked)
      .map((toolName) => ({
        name: toolName,
        provider: tools[toolName].provider || null,
        enabled: true,
      }))

    const schedule: AgentSchedule | null = scheduled ? { cadence, hourOfDay, dayOfWeek } : null

    setError(null)
    startTransition(async () => {
      const result = await createAgentAction({
        siteId,
        role,
        name,
        description,
        promptId,
        tools: selectedTools,
        schedule,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setOk(true)
      setTimeout(resetAndClose, 800)
    })
  }

  return (
    <DialogRoot open={open} onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())}>
      <DialogTrigger asChild>
        <Button variant="primary" size="md">
          <Bot aria-hidden className="size-4" />
          Tạo agent
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Agent mới"
        description="Tool ghi luôn dừng chờ duyệt dù có bật ở đây hay không — chọn ở đây chỉ quyết định agent có được đề xuất hành động đó hay không."
        className="w-[min(680px,calc(100vw-2rem))]"
      >
        <form key={open ? 'open' : 'closed'} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Tên agent" htmlFor="new-agent-name">
            <input id="new-agent-name" name="name" required className={inputClass} />
          </FormField>

          <FormField label="Mô tả" htmlFor="new-agent-description">
            <input id="new-agent-description" name="description" required className={inputClass} />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Vai trò" htmlFor="new-agent-role">
              <select id="new-agent-role" name="role" required defaultValue="seo-analyst" className={inputClass}>
                {Object.entries(AGENT_ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="Prompt điều khiển"
              htmlFor="new-agent-prompt"
              hint={
                prompts.length === 0 ? 'Chưa có prompt nào — tạo trước trong Prompt Studio.' : undefined
              }
            >
              <select
                id="new-agent-prompt"
                name="promptId"
                required
                disabled={prompts.length === 0}
                className={inputClass}
              >
                {prompts.map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <fieldset className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] p-3">
            <legend className="px-1 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
              Lịch chạy
            </legend>
            <label className="flex items-center gap-1.5 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
              <input
                type="checkbox"
                checked={scheduled}
                onChange={(event) => setScheduled(event.target.checked)}
                className="size-3.5 accent-[var(--color-accent)]"
              />
              Chạy tự động theo lịch
            </label>

            {scheduled ? (
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-3 gap-2">
                  <select name="cadence" defaultValue="daily" aria-label="Nhịp chạy" className={inputClass}>
                    {Object.entries(CADENCE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    name="hourOfDay"
                    min={0}
                    max={23}
                    defaultValue={7}
                    aria-label="Giờ chạy trong ngày theo múi giờ site — bỏ qua khi nhịp là 'Mỗi giờ'"
                    className={inputClass}
                  />
                  <input
                    type="number"
                    name="dayOfWeek"
                    min={0}
                    max={6}
                    defaultValue={1}
                    aria-label="Thứ trong tuần (0 = Chủ nhật) — chỉ dùng khi nhịp hằng tuần"
                    className={inputClass}
                  />
                </div>
                <p className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
                  Giờ tính theo múi giờ của site. &quot;Mỗi giờ&quot; bỏ qua ô giờ/thứ.
                </p>
              </div>
            ) : null}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
              Tool được phép dùng
            </legend>

            <p className="text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
              Đọc — tự chạy
            </p>
            {READ_TOOL_NAMES.map((toolName) => (
              <ToolRow
                key={toolName}
                name={toolName}
                selection={tools[toolName]}
                onToggle={toggleTool}
                onProviderChange={setToolProvider}
              />
            ))}

            <p className="mt-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-caution)] uppercase">
              Ghi — cần duyệt
            </p>
            {WRITE_TOOL_NAMES.map((toolName) => (
              <ToolRow
                key={toolName}
                name={toolName}
                selection={tools[toolName]}
                onToggle={toggleTool}
                onProviderChange={setToolProvider}
              />
            ))}
          </fieldset>

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-negative-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--color-negative)]" />
              {error}
            </p>
          ) : null}

          {ok ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-positive-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <Check aria-hidden className="size-4 shrink-0 text-[var(--color-positive)]" />
              Đã tạo agent.
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="md"
            state={pending ? 'loading' : 'idle'}
            loadingLabel="Đang tạo…"
            className="w-full"
            disabled={prompts.length === 0}
          >
            Tạo agent
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

function ToolRow({
  name,
  selection,
  onToggle,
  onProviderChange,
}: {
  readonly name: AgentToolName
  readonly selection: ToolChoice
  readonly onToggle: (name: AgentToolName) => void
  readonly onProviderChange: (name: AgentToolName, provider: ProviderId | '') => void
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
      <label className="flex items-center gap-1.5 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
        <input
          type="checkbox"
          checked={selection.checked}
          onChange={() => onToggle(name)}
          className="size-3.5 accent-[var(--color-accent)]"
        />
        {name}
      </label>
      <select
        aria-label={`Nền tảng cho ${name}`}
        value={selection.provider}
        disabled={!selection.checked}
        onChange={(event) => onProviderChange(name, event.target.value as ProviderId | '')}
        className={cn(inputClass, 'h-8 text-[length:var(--text-xs)]')}
      >
        <option value="">Không cần nền tảng</option>
        {PROVIDERS.map((id) => (
          <option key={id} value={id}>
            {PROVIDER_META[id].shortLabel}
          </option>
        ))}
      </select>
    </div>
  )
}
