-- ============================================================================
-- Realtime cho `connections` và `audit_runs`
--
-- Gói Supabase Pro đã bao gồm Realtime (500 kết nối đồng thời, 5 triệu tin
-- nhắn/tháng) nhưng tới giờ app chưa dùng một dòng nào. Hai chỗ đang phải
-- chịu thiệt vì thiếu nó:
--
-- 1. `audit_runs`: trang Kiểm tra chạy `setInterval(router.refresh, 5000)`
--    suốt thời gian audit chạy. Một lượt audit kéo dài tới 600s → tới ~120
--    lần render lại TOÀN BỘ cây RSC của route, mỗi lần là một lượt gọi hàm
--    Vercel cộng cả chục truy vấn Supabase, chỉ để phát hiện đúng MỘT lần
--    chuyển trạng thái. Realtime biến 120 lượt đó thành 1.
-- 2. `connections`: Topbar và trang Kết nối hiện "Đang đồng bộ lần đầu…" cho
--    tới khi người dùng TỰ bấm F5 — không có polling nào cả. Sau khi kết nối
--    xong một kênh, người dùng ngồi nhìn dòng chữ đó vô thời hạn dù dữ liệu
--    đã về từ lâu.
--
-- RLS vẫn được áp dụng cho từng người đăng ký: Realtime chạy policy SELECT
-- sẵn có của bảng (`is_site_member(...)`) trên từng hàng trước khi phát đi,
-- nên thành viên site này không thể nghe lén thay đổi của site khác. Không
-- cần policy mới, cũng KHÔNG được nới policy cũ ra.
--
-- `replica identity` giữ nguyên mặc định (DEFAULT): payload của UPDATE luôn
-- kèm đủ mọi cột của hàng MỚI, mà `site_id` — cột duy nhất RLS cần — nằm
-- trong đó. `FULL` chỉ cần khi policy phải đọc giá trị CŨ, không phải ở đây,
-- và nó làm WAL phình lên vô ích.
-- ============================================================================

do $$
declare
  target text;
begin
  foreach target in array array['connections', 'audit_runs'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end
$$;
