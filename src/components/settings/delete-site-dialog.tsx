'use client'

import { useActionState, useState } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { Callout } from '@/components/ui/feedback'
import { deleteSiteAction } from '@/lib/actions/site'

/* Hallmark · component: delete-site-dialog · theme: studied-DNA (Ink & Signal)
 *
 * Nút "Xoá website" trước nay là một nút CHẾT — không `onClick`, không form,
 * không action. Bấm vào không xảy ra gì. Đây là phần nối nó vào việc thật.
 *
 * Hộp thoại nói ĐÚNG thứ sẽ mất và đúng thứ lấy lại được. Một hộp thoại chỉ
 * hỏi "bạn chắc chứ?" không giúp ai quyết định cả — nó chỉ thêm một cú bấm
 * trước khi điều tồi tệ vẫn xảy ra.
 */
export function DeleteSiteDialog({
  siteId,
  siteName,
  connectionCount,
}: {
  readonly siteId: string
  readonly siteName: string
  /** Số kênh đang kết nối — người dùng cần biết mình sắp gỡ bao nhiêu thứ. */
  readonly connectionCount: number
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(deleteSiteAction, { error: null })

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="danger" size="md">
          <Trash2 aria-hidden className="size-4" />
          Xoá {siteName}
        </Button>
      </DialogTrigger>

      <DialogContent
        title={`Xoá ${siteName}?`}
        description="Website biến mất khỏi danh sách và mọi kênh của nó ngừng đồng bộ."
      >
        <div className="flex flex-col gap-4">
          <Callout tone="caution" title="Khôi phục được trong 30 ngày">
            Số liệu, đề xuất, kế hoạch và lịch sử agent <strong>vẫn còn nguyên</strong>. Mở lại từ
            trình chọn website ở đầu trang, mục &quot;Đã xoá gần đây&quot;. Sau 30 ngày mới xoá hẳn,
            và lúc đó không lấy lại được.
          </Callout>

          {connectionCount > 0 ? (
            <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
              <strong>{connectionCount}</strong> kênh đang kết nối sẽ bị gỡ cùng lúc. Khi khôi phục
              website, đúng những kênh này được nối lại — kênh bạn đã tự gỡ trước đó thì giữ nguyên
              trạng thái đã gỡ.
            </p>
          ) : (
            <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
              Website này chưa kết nối kênh nào.
            </p>
          )}

          {state.error ? (
            <p className="flex items-center gap-1.5 text-[length:var(--text-sm)] text-[var(--color-negative)]">
              <TriangleAlert aria-hidden className="size-4 shrink-0" />
              {state.error}
            </p>
          ) : null}

          <form action={formAction} className="flex justify-end gap-2">
            <input type="hidden" name="siteId" value={siteId} />
            <Button type="button" variant="secondary" size="md" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button type="submit" variant="danger" size="md" state={pending ? 'loading' : 'idle'}>
              <Trash2 aria-hidden className="size-4" />
              Xoá website
            </Button>
          </form>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
