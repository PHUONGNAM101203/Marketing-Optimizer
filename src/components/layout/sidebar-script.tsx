import { SIDEBAR_STORAGE_KEY } from '@/lib/sidebar'

/**
 * Script chạy TRƯỚC khi trang vẽ lần đầu — cùng lý do với `ThemeScript`:
 * không có nó, rail luôn vẽ full-width trước rồi mới co lại khi React
 * hydrate xong, gây nháy layout mỗi lần tải lại trang lúc đang ở chế độ thu
 * gọn. Script chỉ đọc localStorage và ghi một thuộc tính, không có dữ liệu
 * người dùng nào đi vào chuỗi này.
 */
export function SidebarScript() {
  const script = `(function(){try{if(localStorage.getItem(${JSON.stringify(
    SIDEBAR_STORAGE_KEY,
  )})==="true"){document.documentElement.setAttribute("data-sidebar-collapsed","true")}}catch(e){}})()`

  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
