-- ============================================================================
-- Link mời thành viên — nút "Mời" ở trang Cài đặt trước đây là nút chết.
--
-- Không có hạ tầng gửi email trong app này (xác nhận: grep toàn bộ src/ +
-- package.json không có Resend/SendGrid/SMTP nào) — MVP thực tế nhất là một
-- link cố định mỗi site, chủ sở hữu/quản trị copy rồi tự gửi qua kênh khác
-- (Zalo, email thủ công), giống cách Discord/Notion làm link mời. Một link
-- CỐ ĐỊNH mỗi site, không phải một hàng/lượt mời — tạo lại được (đổi token)
-- để vô hiệu link cũ khi cần, không cần màn hình quản lý danh sách lời mời
-- đang chờ.
-- ============================================================================

create table public.site_invite_links (
  site_id uuid primary key references public.sites(id) on delete cascade,
  token text not null unique,
  role public.site_role not null default 'viewer',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.site_invite_links enable row level security;

-- Chỉ owner/admin xem/tạo/đổi link mời — token là thứ cấp quyền vào site,
-- không phải thông tin thành viên thường cần thấy.
create policy "site_invite_links_select_admin"
  on public.site_invite_links for select
  to authenticated
  using (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

create policy "site_invite_links_insert_admin"
  on public.site_invite_links for insert
  to authenticated
  with check (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

create policy "site_invite_links_update_admin"
  on public.site_invite_links for update
  to authenticated
  using (public.has_site_role(site_id, array['owner','admin']::public.site_role[]))
  with check (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

-- Không có policy select cho người CHƯA phải site member — trang xử lý
-- link mời (`/invite/[token]`) tra token bằng `createAdminClient()` (service
-- role), không qua phiên của người bấm link, vì họ chưa có quyền đọc bảng
-- này theo RLS thường (đúng như thiết kế: họ CHƯA là thành viên).
