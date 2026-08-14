-- ============================================================================
-- Ghi nhớ site đã chọn gần nhất theo tài khoản, để "/" đưa người dùng quay
-- lại đúng site họ đang làm việc thay vì luôn về site tạo đầu tiên.
-- on delete set null: site bị xoá thì quay về hành vi mặc định (site đầu
-- tiên), không kẹt vào lỗi ràng buộc khoá ngoại.
-- ============================================================================

alter table public.profiles
  add column last_site_id uuid references public.sites (id) on delete set null;
