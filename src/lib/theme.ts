/**
 * Chế độ sáng/tối.
 *
 * BA trạng thái, không phải hai. `system` là mặc định và là trạng thái khác hẳn
 * `light` — nó đi theo cài đặt hệ điều hành và tự đổi khi người dùng đổi máy
 * sang chế độ tối buổi tối. Rút gọn còn hai trạng thái là lấy mất khả năng đó.
 *
 * Cách token trong `tokens.css` được viết đã tính sẵn cho ba trạng thái này:
 *   :root                                          → sáng
 *   @media (prefers-color-scheme: dark)
 *     :root:not([data-theme="light"])              → tối theo hệ thống
 *   :root[data-theme="dark"]                       → tối do người dùng chọn
 *
 * Mệnh đề `:not([data-theme="light"])` là thứ cho phép người dùng ép sáng ngay
 * cả khi hệ điều hành đang ở chế độ tối.
 */

export const THEME_MODES = ['light', 'dark', 'system'] as const

export type ThemeMode = (typeof THEME_MODES)[number]

export const THEME_STORAGE_KEY = 'marketing-optimizer.theme'

export const THEME_LABELS: Readonly<Record<ThemeMode, string>> = {
  light: 'Sáng',
  dark: 'Tối',
  system: 'Theo hệ thống',
}

export const isThemeMode = (value: unknown): value is ThemeMode =>
  typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value)

/**
 * Ghi lựa chọn lên thẻ `<html>`.
 * `system` XOÁ thuộc tính thay vì đặt giá trị — để media query trong CSS tự
 * quyết định. Đặt `data-theme="system"` sẽ không khớp selector nào và trang
 * kẹt ở màu sáng.
 */
export const applyTheme = (mode: ThemeMode): void => {
  const root = document.documentElement
  if (mode === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', mode)
  }
}

export const readStoredTheme = (): ThemeMode => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(stored) ? stored : 'system'
  } catch {
    // Trình duyệt chặn localStorage (chế độ riêng tư, cookie bị khoá) —
    // không được để cả app đổ vì một tuỳ chọn hiển thị.
    return 'system'
  }
}

export const storeTheme = (mode: ThemeMode): void => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Bỏ qua: lựa chọn vẫn áp dụng cho phiên hiện tại, chỉ là không nhớ được.
  }
}
