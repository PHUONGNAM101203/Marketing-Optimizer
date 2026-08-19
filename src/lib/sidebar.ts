/**
 * Thu gọn sidebar về icon-only.
 *
 * Cùng cơ chế với `theme.ts` (localStorage + thuộc tính trên `<html>` đọc
 * được TRƯỚC khi React hydrate, tránh nháy độ rộng rail khi tải lại trang —
 * xem `SidebarScript`). Khác theme ở một điểm: nút bấm nằm ngay TRONG
 * `SideRail`, không phải một dropdown Radix có state nội bộ tự kích hoạt
 * re-render như `ThemeToggle` — nên phải tự bắn một `CustomEvent` để
 * `useSyncExternalStore` biết mà đọc lại localStorage ngay trong CÙNG tab,
 * không thể chỉ dựa vào sự kiện `storage` (sự kiện đó CHỈ nổ ở tab khác).
 */

export const SIDEBAR_STORAGE_KEY = 'marketing-optimizer.sidebar-collapsed'

const SIDEBAR_CHANGE_EVENT = 'sidebar-collapsed-change'

/** Ghi lựa chọn lên thẻ `<html>` — CSS đọc thuộc tính này để đổi
 * `--rail-w` (xem `tokens.css`), không phải className React tính lại. */
export const applySidebarCollapsed = (collapsed: boolean): void => {
  const root = document.documentElement
  if (collapsed) root.setAttribute('data-sidebar-collapsed', 'true')
  else root.removeAttribute('data-sidebar-collapsed')
}

export const readStoredSidebarCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  } catch {
    // Trình duyệt chặn localStorage (chế độ riêng tư, cookie bị khoá) —
    // không được để cả app đổ vì một tuỳ chọn hiển thị.
    return false
  }
}

export const storeSidebarCollapsed = (collapsed: boolean): void => {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed))
  } catch {
    // Bỏ qua: lựa chọn vẫn áp dụng cho phiên hiện tại, chỉ là không nhớ được.
  }
  window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT))
}

export const subscribeSidebarCollapsed = (onChange: () => void): (() => void) => {
  window.addEventListener('storage', onChange)
  window.addEventListener(SIDEBAR_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, onChange)
  }
}

// Server luôn coi sidebar đang mở — không có cách nào biết localStorage của
// client lúc render đầu. `useSyncExternalStore` tự sửa lại đúng ngay sau khi
// client mount (xem cách `ThemeToggle` dùng `getServerAppearance` cùng ý).
export const getServerSidebarCollapsed = (): boolean => false
