# Ghi nhớ site đã chọn gần nhất

## Vấn đề

Điểm vào `/` (`src/app/page.tsx`) luôn redirect người dùng đã đăng nhập tới site đầu tiên (`sites[0]`, sắp theo `created_at`). Người dùng quản lý nhiều site phải tự chọn lại site đang làm việc mỗi lần reload trang, đăng xuất/đăng nhập lại, hoặc mở app trên một tab mới.

## Phạm vi

- Chỉ ghi nhớ **site/channel đang chọn**. Không mở rộng sang date range, tab đang xem, hay bộ lọc — các trạng thái đó vẫn reset mỗi phiên như hiện tại.
- Lưu theo **tài khoản user** (không phải theo trình duyệt/thiết bị), để hoạt động xuyên thiết bị và sống sót qua đăng xuất/đăng nhập.

## Thiết kế

### Lưu trữ

Thêm cột `profiles.last_site_id uuid references public.sites(id) on delete set null` qua migration mới trong `supabase/migrations/`, theo đúng convention các migration hiện có (comment giải thích lý do, không có logic nghiệp vụ ẩn).

`on delete set null`: nếu site bị xoá, cột tự về NULL thay vì lỗi ràng buộc khoá ngoại.

### Đọc — điểm vào `/`

`src/app/page.tsx` hiện tại:

```ts
const sites = await listSites()
if (sites.length === 0) redirect('/onboarding')
redirect(`/${sites[0]!.id}/overview`)
```

Sửa thành: lấy thêm `profile.lastSiteId` (qua `getCurrentProfile()` mở rộng), nếu giá trị đó **vẫn có trong** `sites` (còn tồn tại + user còn quyền, vì `listSites()` đã lọc theo RLS) → redirect tới đó; nếu không (chưa từng chọn, site đã bị xoá, hoặc mất quyền truy cập) → fallback về `sites[0]` như hiện tại. Không có nhánh nào dẫn tới 404.

### Ghi — mỗi khi vào một site

`src/app/(app)/[siteId]/layout.tsx` đã gọi `getCurrentProfile()` để lấy `profile`. Sau khi xác nhận `site` tồn tại (`if (!site) notFound()`), nếu `profile.lastSiteId !== siteId`, lên lịch ghi bằng `after()` (API ổn định trong `next/server`, đã có sẵn ở Next 16.3.0 đang dùng trong repo):

```ts
if (profile.lastSiteId !== siteId) {
  after(() => setLastSiteId(profile.userId, siteId))
}
```

`after()` chạy sau khi response đã trả về — không thêm độ trễ cho việc render trang. Chỉ ghi khi site thực sự đổi (so với giá trị đã lưu), không ghi lại mỗi lần chuyển tab/trang trong cùng một site.

### `src/lib/data/sites.ts`

- `getCurrentProfile()`: mở rộng `select` thêm `last_site_id`, trả về thêm field `lastSiteId: string | null` trong object kết quả.
- Thêm hàm mới `setLastSiteId(userId: string, siteId: string): Promise<void>` — update một dòng theo khoá chính (`profiles.id`), RLS policy `profiles_update_own` đã có sẵn từ migration gốc nên không cần thêm policy mới. Bắt lỗi bên trong hàm bằng `console.error`, không throw — lỗi ghi nhớ site không được phép làm hỏng trải nghiệm xem trang.

### Không đổi

- `SiteSwitcher` (`src/components/layout/topbar.tsx`) — vẫn là `<Link>` điều hướng, không cần thêm state hay handler nào. Việc ghi nhớ xảy ra tự động ở layout khi route `[siteId]` mới render.

## Edge case

| Tình huống | Kết quả |
|---|---|
| User chưa từng chọn site nào (lastSiteId = NULL) | Fallback `sites[0]`, y hệt hành vi hiện tại |
| Site đã lưu bị xoá / user bị gỡ quyền | Không còn trong `listSites()` → fallback `sites[0]` |
| User có 0 site | Vẫn redirect `/onboarding`, không đổi |
| Ghi `last_site_id` thất bại (lỗi DB/mạng) | Log lỗi, không ảnh hưởng trang đang xem |

## Testing

Repo hiện không có bộ test tự động (không vitest/jest, không script test trong `package.json`). Xác minh bằng: `tsc` type-check sau khi sửa, và kiểm thử tay 3 kịch bản — (1) chọn site B → reload `/` → vẫn vào B; (2) đăng xuất → đăng nhập lại → vẫn vào B; (3) gỡ quyền truy cập site B → vào `/` → fallback sang site còn lại.
