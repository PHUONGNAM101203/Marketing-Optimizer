import { THEME_STORAGE_KEY } from '@/lib/theme'

/**
 * Script chạy TRƯỚC khi trang vẽ lần đầu.
 *
 * Không có nó, trang luôn vẽ ra nền sáng trước rồi mới nhảy sang tối khi React
 * hydrate xong — cú nháy trắng đó chính là thứ khó chịu nhất khi dùng chế độ
 * tối ban đêm. Đây là một trong số rất ít chỗ `dangerouslySetInnerHTML` là
 * đúng: script phải là đồng bộ và phải nằm trong HTML đầu tiên gửi về.
 *
 * Script chỉ đọc localStorage và ghi một thuộc tính. Không có dữ liệu người
 * dùng nào đi vào chuỗi này, nên không có bề mặt tấn công injection.
 */
export function ThemeScript() {
  const script = `(function(){try{var m=localStorage.getItem(${JSON.stringify(
    THEME_STORAGE_KEY,
  )});if(m==="dark"||m==="light"){document.documentElement.setAttribute("data-theme",m)}}catch(e){}})()`

  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
