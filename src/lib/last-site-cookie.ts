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

/**
 * Chỉ nhận đúng dạng UUID. Thiếu kiểm tra này thì một cookie bịa như
 * `../../evil` sẽ được ghép thẳng vào đường dẫn chuyển hướng; ở đây giá trị
 * lạ rơi về đường cũ thay vì tạo ra một URL không lường trước.
 */
export const parseLastSiteCookie = (value: string | undefined): string | null =>
  value && UUID_RE.test(value) ? value : null
