import { notFound } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getSite, listMembers } from '@/lib/data/sites'
import { getInviteLink } from '@/lib/data/site-invite'
import { getLatestAuditPageSignals } from '@/lib/data/audit'
import { applyDetectedMarketOnce } from '@/lib/audit/apply-market'
import { getSiteAiConnection } from '@/lib/data/site-ai-keys'
import { createAdminClient } from '@/lib/supabase/admin'
import { EditSiteForm } from '@/components/settings/edit-site-form'
import { AiKeySetup } from '@/components/settings/ai-key-setup'
import { InviteMemberDialog } from '@/components/settings/invite-member-dialog'
import { canManageConnections, type SiteRole } from '@/lib/domain/site'
import { TLD_MARKET } from '@/lib/audit/market-detection'
import { formatRelativeTime } from '@/lib/format'

export const metadata = { title: 'Cài đặt' }

const ROLE_LABELS: Readonly<Record<SiteRole, string>> = {
  owner: 'Chủ sở hữu',
  admin: 'Quản trị',
  viewer: 'Chỉ xem',
}

export default async function SettingsPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>
}) {
  const { siteId } = await params
  let site = await getSite(siteId)
  if (!site) notFound()

  // Tự chữa cho site đã quét TRƯỚC KHI logic đoán thị trường đạt độ tin cậy
  // đúng (vd. site .dk có lang="en" mặc định — xem `market-detection.ts`) —
  // đọc lại `page_signals` đã có sẵn từ lượt quét gần nhất, KHÔNG quét lại.
  if (site.currency === 'VND' && site.timezone === 'Asia/Ho_Chi_Minh') {
    const pageSignals = await getLatestAuditPageSignals(site.id)
    if (pageSignals.length > 0) {
      const applied = await applyDetectedMarketOnce(
        createAdminClient(),
        site.id,
        site.domain,
        pageSignals.map((page) => page.lang),
      )
      if (applied) site = (await getSite(siteId)) ?? site
    }
  }

  const members = await listMembers(site.id)
  const aiConnection = await getSiteAiConnection(site.id)
  const inviteLink = await getInviteLink(site.id)

  return (
    <PageShell>
      <PageHeader
        title="Cài đặt"
        description={`Thông tin và quyền truy cập của ${site.domain}.`}
      />

      <Card>
        <CardHeader title="Thông tin website" ruled />
        <CardBody className="pt-4">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Field label="Tên hiển thị" value={site.name} />
            <Field label="URL" value={site.url} />
            <Field label="Tên miền" value={site.domain} />
            <Field
              label="Quốc gia"
              value={site.country ? (TLD_MARKET[site.country]?.countryLabel ?? site.country) : 'Chưa xác định'}
              hint="Suy ra từ tên miền + ngôn ngữ trang lúc quét, sửa được ở dưới."
            />
            <Field
              label="Múi giờ"
              value={site.timezone}
              hint="Quyết định ranh giới ngày của mọi số liệu."
            />
            <Field
              label="Đơn vị tiền"
              value={site.currency}
              hint="Mọi chi phí từ các nền tảng được quy về đơn vị này."
            />
            <Field
              label="Ngày tạo"
              value={formatRelativeTime(site.createdAt, new Date())}
            />
          </dl>

          <div className="mt-5 border-t border-[var(--color-rule)] pt-4">
            <EditSiteForm site={site} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Thành viên"
          description="Người có quyền chỉ xem không kết nối được tài khoản quảng cáo và không duyệt được hành động của agent."
          action={
            <InviteMemberDialog
              siteId={site.id}
              initialToken={inviteLink?.token ?? null}
              initialRole={inviteLink?.role ?? 'viewer'}
            />
          }
          ruled
        />
        <CardBody className="pt-0">
          <ul className="divide-y divide-[var(--color-rule)]">
            {members.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5"
              >
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-paper-3)] text-[length:var(--text-xs)] font-semibold text-[var(--color-ink-2)]"
                >
                  {member.displayName.charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                    {member.displayName}
                  </p>
                  <p className="truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                    {member.email || 'Email nằm ở auth.users — hiện được từ M3'}
                  </p>
                </div>

                <Badge tone={member.role === 'owner' ? 'ink' : 'outline'}>
                  {ROLE_LABELS[member.role]}
                </Badge>

                <span className="shrink-0 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                  {canManageConnections(member.role)
                    ? 'Quản lý kết nối được'
                    : 'Chỉ xem'}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="AI Provider"
          description="Dùng cho nút &quot;Chạy thử&quot; ở Prompt Studio và cho các agent tự động của website này. Hỗ trợ Claude, OpenAI, hoặc Gemini — một provider tại một thời điểm."
          ruled
        />
        <CardBody className="pt-4">
          <AiKeySetup siteId={site.id} connection={aiConnection} />
        </CardBody>
      </Card>

      <Card tone="critical">
        <CardHeader
          title="Xoá website"
          description="Xoá vĩnh viễn Site này cùng toàn bộ số liệu đã đồng bộ, đề xuất, kế hoạch và lịch sử agent. Không hoàn tác được."
        />
        <CardBody>
          <Button variant="danger" size="md">
            <Trash2 aria-hidden className="size-4" />
            Xoá {site.name}
          </Button>
        </CardBody>
      </Card>
    </PageShell>
  )
}

function Field({
  label,
  value,
  hint,
}: {
  readonly label: string
  readonly value: string
  readonly hint?: string
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
        {label}
      </dt>
      <dd className="mt-1 truncate text-[length:var(--text-sm)] text-[var(--color-ink)]">
        {value}
      </dd>
      {hint ? (
        <p className="mt-0.5 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
