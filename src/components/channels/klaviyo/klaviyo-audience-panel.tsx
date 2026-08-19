import { Badge } from '@/components/ui/badge'
import { Card, SectionHead } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { NameList } from '@/components/channels/klaviyo/klaviyo-dashboard'
import { klaviyoResourceUrl } from '@/lib/domain/klaviyo-web-links'
import type { KlaviyoForm, KlaviyoList, KlaviyoMetric, KlaviyoSegment } from '@/lib/providers/klaviyo'

const FORM_STATUS_LABELS: Readonly<Record<KlaviyoForm['status'], string>> = {
  draft: 'Nháp',
  live: 'Đang chạy',
  unknown: 'Không rõ',
}

/* Hallmark · component: klaviyo-audience-panel · theme: studied-DNA (Ink & Signal)
 *
 * Tab "Đối tượng" của Klaviyo — mọi thứ KHÔNG phải hiệu suất campaign/flow
 * (đã ở `KlaviyoDashboard`/tab "Tổng quan"): Segment, List, Form đăng ký, và
 * toàn bộ loại sự kiện (metric) tài khoản đang ghi nhận. Đúng yêu cầu "lấy
 * hết tất cả các thông tin dữ liệu có trên Klaviyo" — segment/list/form đều
 * phân trang đầy đủ ở tầng provider (`fetchKlaviyoSegments` v.v.), không
 * còn cap cứng 10 dòng như bản đầu.
 */
export interface KlaviyoAudiencePanelProps {
  readonly segments: readonly KlaviyoSegment[]
  readonly segmentsTruncated: boolean
  readonly lists: readonly KlaviyoList[]
  readonly listsTruncated: boolean
  readonly forms: readonly KlaviyoForm[]
  readonly formsTruncated: boolean
  readonly metrics: readonly KlaviyoMetric[]
  readonly metricsTruncated: boolean
}

export function KlaviyoAudiencePanel({
  segments,
  segmentsTruncated,
  lists,
  listsTruncated,
  forms,
  formsTruncated,
  metrics,
  metricsTruncated,
}: KlaviyoAudiencePanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <NameList
          label="Segment"
          title="Segment"
          truncated={segmentsTruncated}
          items={segments.map((segment) => ({
            id: segment.id,
            name: segment.name,
            badge: segment.isActive ? 'Đang hoạt động' : 'Tạm dừng',
            href: klaviyoResourceUrl('segment', segment.id),
          }))}
        />
        <NameList
          label="List"
          title="Danh sách (List)"
          truncated={listsTruncated}
          items={lists.map((list) => ({
            id: list.id,
            name: list.name,
            href: klaviyoResourceUrl('list', list.id),
          }))}
        />
      </div>

      <NameList
        label="Form"
        title="Form đăng ký"
        truncated={formsTruncated}
        items={forms.map((form) => ({
          id: form.id,
          name: form.name,
          badge: FORM_STATUS_LABELS[form.status],
          href: klaviyoResourceUrl('form', form.id),
        }))}
      />

      <section className="flex flex-col gap-3">
        <SectionHead label="Sự kiện" title="Sự kiện đang được theo dõi" />
        {metricsTruncated ? (
          <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
            Danh sách sự kiện lớn hơn số đọc được — bên dưới chỉ là một phần.
          </p>
        ) : null}
        <Card className="p-4">
          {metrics.length === 0 ? (
            <EmptyState
              title="Chưa có gì"
              description="Tài khoản Klaviyo chưa ghi nhận sự kiện nào."
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {metrics.map((metric) => (
                <Badge key={metric.id} tone="outline">
                  {metric.name}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  )
}
