/**
 * Site mở gần nhất, lưu thêm vào cookie bên cạnh `profiles.last_site_id`.
 *
 * Lý do tồn tại là TỐC ĐỘ KHỞI ĐỘNG. `start_url` của PWA là `/` (xem
 * `app/manifest.ts`), nên mỗi lần mở app từ màn hình chính đều đi qua đó.
 * Trang `/` phải xác thực, đọc `listSites()`, đọc `profiles.last_site_id`,
 * rồi `redirect()` — mà `redirect()` bắt trình duyệt đi THÊM MỘT VÒNG HTTP
 * đầy đủ nữa. Tức mở app tốn HAI lượt gọi hàm server, mỗi lượt đều có thể
 * dính cold start (đo được ~550ms mỗi lần nguội).
 *
 * Cookie cho `proxy.ts` biết đích đến ngay tại edge và chuyển hướng luôn, bỏ
 * hẳn lượt gọi hàm thứ nhất.
 *
 * KHÔNG phải dữ liệu tin cậy, và không cần phải vậy: nó chỉ quyết định điều
 * hướng tới ĐÂU. Route đích vẫn qua `proxy` (chặn khi chưa đăng nhập), vẫn
 * qua RLS, và layout vẫn `notFound()` nếu người dùng không có quyền với site
 * đó. Cookie bị sửa tay chỉ dẫn tới một trang 404 — không lộ gì, nên không
 * cần ký hay mã hoá.
 */
export const LAST_SITE_COOKIE = 'mo.last-site'

/** Một năm — cookie chỉ là gợi ý điều hướng. Hết hạn thì rơi về đường cũ
 * (trang `/` tự tra `profiles.last_site_id`), không mất mát gì. */
export const LAST_SITE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isUuid = (value: string): boolean => UUID_RE.test(value)

/**
 * Giá trị cookie GẮN VỚI TÀI KHOẢN: `<userId>:<siteId>`.
 *
 * Không có phần `userId` thì mở app bằng một tài khoản khác trên cùng trình
 * duyệt sẽ bị đẩy thẳng sang site của tài khoản trước, và layout `notFound()`
 * — người dùng thấy trang 404 ngay khi vừa vào app. Đây là lỗi thật đã xảy ra,
 * không phải phòng xa: một máy đăng nhập hai tài khoản là chuyện bình thường.
 *
 * Không phải cơ chế bảo mật — quyền truy cập vẫn do RLS và layout quyết định.
 * Nó chỉ để KHÔNG điều hướng tới một nơi chắc chắn sai.
 */
export const formatLastSiteCookie = (userId: string, siteId: string): string =>
  `${userId}:${siteId}`

/**
 * Chỉ trả về siteId khi cookie hợp lệ VÀ thuộc đúng người dùng hiện tại.
 *
 * Kiểm tra dạng UUID để một cookie bịa như `../../evil` không bị ghép thẳng
 * vào đường dẫn chuyển hướng. Giá trị theo định dạng CŨ (chỉ mỗi siteId, do
 * bản trước ghi ra) không khớp và rơi về đường cũ — trang `/` tự tra
 * `profiles.last_site_id` rồi ghi lại cookie theo định dạng mới.
 */
export const parseLastSiteCookie = (
  value: string | undefined,
  userId: string,
): string | null => {
  if (!value) return null
  const separator = value.indexOf(':')
  if (separator === -1) return null
  const [cookieUserId, siteId] = [value.slice(0, separator), value.slice(separator + 1)]
  if (cookieUserId !== userId || !isUuid(siteId)) return null
  return siteId
}

/** Kiểm tra riêng phần lấy siteId TỪ ĐƯỜNG DẪN, nơi không có gì để so với
 * tài khoản — đường dẫn là thứ người dùng đang thực sự xem. */
export const parseSiteIdFromPath = (segment: string | undefined): string | null =>
  segment && isUuid(segment) ? segment : null
