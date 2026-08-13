-- ============================================================================
-- Sửa: chủ sở hữu không đọc được Site ngay sau khi tạo
--
-- TRIỆU CHỨNG
--   insert into sites (...) returning *   →  42501 row-level security violation
--   insert into sites (...)               →  thành công
--
-- NGUYÊN NHÂN
--   Mệnh đề RETURNING phải qua policy SELECT, không chỉ WITH CHECK của INSERT.
--   Policy SELECT cũ đòi `is_site_member(id)`, còn dòng thành viên lại do
--   trigger AFTER INSERT `on_site_created` tạo ra — chưa nhìn thấy được tại
--   thời điểm RETURNING đọc dòng vừa chèn. Vậy là chủ sở hữu bị chặn đọc chính
--   Site mình vừa tạo.
--
--   Bug này chỉ lộ ra khi chạy thật với hai tài khoản. Migration chạy sạch,
--   TypeScript xanh, `next build` xanh — không công cụ tĩnh nào bắt được.
--
-- CÁCH SỬA
--   Thêm nhánh `owner_id = auth.uid()` vào policy SELECT.
--   Ngoài việc gỡ lỗi trên, nó còn đóng một lỗ hổng vận hành: nếu dòng
--   site_members bị xoá nhầm, chủ sở hữu vẫn còn đường vào Site của mình thay
--   vì bị khoá vĩnh viễn khỏi dữ liệu của chính họ.
-- ============================================================================

drop policy if exists "sites_select_member" on public.sites;

create policy "sites_select_member"
  on public.sites for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or public.is_site_member(id)
  );
