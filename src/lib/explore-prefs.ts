/**
 * Lựa chọn bộ lọc của trang Khám phá, nhớ RIÊNG THEO TỪNG NỀN TẢNG.
 *
 * Vì sao phải tách theo nền tảng: các chỉ số không dùng chung được. TikTok
 * không có doanh thu, còn với Klaviyo doanh thu là chỉ số chính. Bỏ tick
 * "Doanh thu" ở tab TikTok mà làm mất luôn ở Klaviyo là phá đúng việc người
 * dùng đang cố làm. Mỗi tab vốn đã có state riêng trong bộ nhớ (mỗi tab render
 * một `ReportBuilder` riêng); ở đây chỉ thêm phần nhớ lại sau khi tải lại trang.
 *
 * `localStorage` chứ không phải database hay URL: đây là tuỳ chọn hiển thị của
 * riêng một người trên một máy — không đáng một cột trong bảng, và nhét vào URL
 * thì link chia sẻ sẽ mang theo lựa chọn cá nhân sang người khác. Cùng lựa chọn
 * với `lib/sidebar.ts` và `lib/theme.ts`.
 *
 * Kiểu ở đây cố tình để `string`/`string[]` thay vì union hẹp: `localStorage`
 * là dữ liệu người dùng sửa được, và tập chỉ số hợp lệ còn đổi theo phiên bản
 * app. Nơi gọi PHẢI kiểm tra lại từng giá trị trước khi dùng — đọc một khoá cũ
 * không còn hợp lệ phải rơi về mặc định, không được làm vỡ trang.
 */

const STORAGE_KEY = 'marketing-optimizer.explore-prefs'

export interface ExplorePrefs {
  readonly rowLimit: number
  readonly ga4Dimension: string
  readonly gscDimension: string
  readonly metrics: readonly string[]
  readonly sortBy: string
}

type PrefsByFamily = Readonly<Record<string, Partial<ExplorePrefs>>>

const readAll = (): PrefsByFamily => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? (parsed as PrefsByFamily) : {}
  } catch {
    // JSON hỏng, hoặc trình duyệt chặn localStorage (chế độ riêng tư, cookie bị
    // khoá) — một tuỳ chọn hiển thị không được phép làm đổ cả trang.
    return {}
  }
}

const CHANGE_EVENT = 'explore-prefs-change'

export const EMPTY_PREFS: Partial<ExplorePrefs> = {}

/** Snapshot phải giữ NGUYÊN THAM CHIẾU khi nội dung không đổi.
 * `useSyncExternalStore` so sánh bằng `Object.is`; trả về một object mới ở mỗi
 * lần đọc là vòng lặp render vô hạn. Nhớ lại chuỗi thô đã parse và chỉ tạo
 * object mới khi chuỗi đó thật sự khác. */
let cachedRaw: string | null = null
const cachedByFamily = new Map<string, Partial<ExplorePrefs>>()

export const snapshotExplorePrefs = (family: string): Partial<ExplorePrefs> => {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return EMPTY_PREFS
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedByFamily.clear()
  }

  const hit = cachedByFamily.get(family)
  if (hit) return hit

  const value = readAll()[family] ?? EMPTY_PREFS
  cachedByFamily.set(family, value)
  return value
}

/** Server không có `localStorage` — luôn trả cùng một object rỗng để lượt
 * render trên server và lượt hydrate đầu tiên khớp nhau. */
export const serverExplorePrefs = (): Partial<ExplorePrefs> => EMPTY_PREFS

export const subscribeExplorePrefs = (onChange: () => void): (() => void) => {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

/** Ghi ĐÈ lựa chọn của đúng một nền tảng, giữ nguyên các nền tảng khác — đó
 * chính là toàn bộ mục đích của file này. */
export const writeExplorePrefs = (family: string, prefs: ExplorePrefs): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [family]: prefs }))
    // `storage` CHỈ nổ ở tab khác — cùng tab phải tự bắn sự kiện, đúng như
    // `lib/sidebar.ts` đã làm, nếu không giao diện không cập nhật sau khi bấm.
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // Bỏ qua: lựa chọn vẫn áp dụng cho phiên hiện tại, chỉ là không nhớ được.
  }
}
