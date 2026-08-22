-- ============================================================================
-- Gỡ quyền EXECUTE thừa trên 4 hàm SECURITY DEFINER
--
-- Do Security Advisor của Supabase (có sẵn trong gói, chạy qua Management API)
-- chỉ ra. Mọi hàm trong schema `public` đều tự động lộ thành endpoint
-- `/rest/v1/rpc/<tên>` của PostgREST, nên "hàm nội bộ" không phải là một khái
-- niệm mà Postgres tự hiểu — phải thu hồi quyền một cách tường minh.
--
-- Vì sao `revoke all ... from public` ở migration 20260812000001 KHÔNG đủ:
-- Supabase cài sẵn `alter default privileges in schema public grant all on
-- functions to anon, authenticated, service_role`. Đó là các grant RIÊNG cho
-- từng role, không phải grant cho `PUBLIC`, nên thu hồi khỏi `PUBLIC` không
-- đụng tới chúng. Xác nhận bằng `proacl` thật trên production: `anon=X/postgres`
-- vẫn còn nguyên trên cả bốn hàm.
--
-- 1. `handle_new_user`, `handle_new_site`: hàm TRIGGER. Không có lý do gì để
--    gọi trực tiếp, mà lại chạy dưới quyền owner (`SECURITY DEFINER`). Thu
--    hồi khỏi mọi role — trigger vẫn chạy bình thường vì trigger thực thi hàm
--    theo quyền của chính trigger, không qua quyền EXECUTE của người gọi.
-- 2. `is_site_member`, `has_site_role`: `authenticated` PHẢI giữ (52 policy
--    RLS gọi chúng — đã đếm trên production trước khi sửa). `anon` thì không:
--    KHÔNG có policy nào cấp cho `anon`, và với phiên `anon` thì `auth.uid()`
--    là null nên hàm luôn trả false — quyền này không phục vụ gì cả.
-- ============================================================================

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_new_site() from public, anon, authenticated;

revoke all on function public.is_site_member(uuid) from anon;
revoke all on function public.has_site_role(uuid, public.site_role[]) from anon;
