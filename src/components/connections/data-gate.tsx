import type { ReactNode } from 'react'
import { getConnectionSummary } from '@/lib/data/connections'
import { LockedPreview } from './locked-preview'

/**
 * Cổng dữ liệu.
 *
 * Bọc quanh phần nội dung phụ thuộc số liệu của mọi màn hình. Site chưa có
 * kết nối nào thì phần đó hiện dưới dạng khoá mờ kèm nhãn "dữ liệu minh hoạ";
 * có kết nối rồi thì hiện thẳng.
 *
 * Đặt kiểm tra ở MỘT chỗ thay vì rải if-else khắp các trang: quên một trang là
 * trang đó nói dối, và người ta chỉ phát hiện ra khi đã tin vào con số sai.
 */
export interface DataGateProps {
  readonly siteId: string
  readonly title: string
  readonly description: string
  readonly children: ReactNode
}

export async function DataGate({
  siteId,
  title,
  description,
  children,
}: DataGateProps) {
  const summary = await getConnectionSummary(siteId)

  if (summary.hasData) return <>{children}</>

  return (
    <LockedPreview siteId={siteId} title={title} description={description}>
      {children}
    </LockedPreview>
  )
}
