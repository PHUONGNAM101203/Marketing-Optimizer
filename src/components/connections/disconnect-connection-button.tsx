'use client'

import { useActionState, useState } from 'react'
import { Link2Off } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import {
  disconnectConnectionAction,
  type DisconnectConnectionState,
} from '@/lib/actions/connections'

const INITIAL_STATE: DisconnectConnectionState = { error: null, done: false }

/**
 * Xoá connection là hành động không thể hoàn tác (mất cả lịch sử số liệu đã
 * đồng bộ, xem comment ở `disconnectConnectionAction`) — khác các action
 * xoá khác trong app (vd. `deletePlanItemAction`) vốn bấm-là-xoá ngay không
 * hỏi lại, vì hậu quả ở đây lớn hơn hẳn một dòng trong kế hoạch. Bọc trong
 * dialog xác nhận thay vì submit thẳng.
 */
export function DisconnectConnectionButton({
  connectionId,
  providerLabel,
  accountName,
}: {
  readonly connectionId: string
  readonly providerLabel: string
  readonly accountName: string
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(disconnectConnectionAction, INITIAL_STATE)

  // `state.done` chỉ đổi true khi action vừa xoá xong — không dùng effect để
  // đóng dialog (setState trong effect gây render lồng nhau không cần
  // thiết), mà suy trực tiếp trạng thái mở từ hai nguồn: người dùng bấm mở
  // (`open`) VÀ action chưa hoàn tất. Sau khi xoá xong, connection biến mất
  // khỏi danh sách qua `revalidatePath` nên component này unmount theo, an
  // toàn không cần lo trạng thái `done` cũ còn sót lại cho lần mở sau.
  return (
    <DialogRoot open={open && !state.done} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Link2Off aria-hidden className="size-3.5" />
          Ngắt kết nối
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Ngắt kết nối ${providerLabel}?`}
        description={`Xoá kết nối tới ${accountName}. Toàn bộ số liệu đã đồng bộ của nguồn này sẽ mất theo, không thể hoàn tác — kết nối lại được bất cứ lúc nào nhưng lịch sử cũ không quay lại.`}
      >
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="connectionId" value={connectionId} />

          {state.error ? (
            <p className="text-[length:var(--text-xs)] text-[var(--color-negative)]">{state.error}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button type="submit" variant="danger" size="sm" state={pending ? 'loading' : 'idle'}>
              Ngắt kết nối
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
