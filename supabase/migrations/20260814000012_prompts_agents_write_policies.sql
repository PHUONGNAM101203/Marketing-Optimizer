-- ============================================================================
-- Bổ sung policy GHI còn thiếu cho Prompt Studio + Agents
--
-- 20260814000010/20260814000011 chỉ tạo policy SELECT — RLS bật mà không có
-- policy INSERT/UPDATE thì Postgres từ chối mọi ghi từ vai trò `authenticated`
-- theo mặc định (`createClient()` phiên người dùng, không phải
-- `createAdminClient()`). Kết quả: mọi hàm ghi trong `src/lib/data/prompts.ts`
-- sẽ ném lỗi (insert) hoặc âm thầm không đổi gì (update khớp 0 hàng, Supabase
-- không coi đó là lỗi). Vá đúng chỗ hổng, theo đúng khuôn
-- `connections_insert_admin`/`connections_update_admin`
-- (20260812000003_connections.sql:76-85).
-- ============================================================================

-- --------------------------------------------------------------------------
-- Prompt Studio
-- --------------------------------------------------------------------------

-- Tạo/sửa prompt template là hành động cấu hình, khớp mức admin của
-- `tracked_prompts`/`connections` — không phải việc ai trong site cũng làm.
create policy "prompts_insert_admin"
  on public.prompts for insert
  to authenticated
  with check (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

create policy "prompts_update_admin"
  on public.prompts for update
  to authenticated
  using (public.has_site_role(site_id, array['owner','admin']::public.site_role[]))
  with check (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

-- Cần cho luồng dọn dẹp của `createPrompt`: nếu tạo version 1 hoặc gán
-- current_version_id thất bại giữa chừng, code xoá lại hàng `prompts` vừa
-- tạo để không lộ trạng thái orphan (current_version_id = null) ra ngoài.
-- Không có policy delete thì lệnh xoá đó âm thầm khớp 0 hàng, y hệt lỗi
-- silent no-op đã thấy ở `ratePromptRun`.
create policy "prompts_delete_admin"
  on public.prompts for delete
  to authenticated
  using (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

-- Chỉ INSERT — version là log chỉ-thêm, không bao giờ sửa (khớp thiết kế
-- "không bao giờ mutate một version đã có" của domain layer).
create policy "prompt_versions_insert_admin"
  on public.prompt_versions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_id
        and public.has_site_role(p.site_id, array['owner','admin']::public.site_role[])
    )
  );

-- Chạy thử/đánh giá một prompt là việc dùng hàng ngày, không phải cấu hình —
-- gate ở mức thành viên (`is_site_member`), không cần admin.
create policy "prompt_runs_insert_member"
  on public.prompt_runs for insert
  to authenticated
  with check (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_id and public.is_site_member(p.site_id)
    )
  );

create policy "prompt_runs_update_member"
  on public.prompt_runs for update
  to authenticated
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_id and public.is_site_member(p.site_id)
    )
  )
  with check (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_id and public.is_site_member(p.site_id)
    )
  );

-- --------------------------------------------------------------------------
-- Agents — cùng lỗ hổng gốc, vá luôn để không phải phát hiện lại lần sau.
-- --------------------------------------------------------------------------

-- Tạo agent / bật-tắt agent là cấu hình, khớp mức admin của `connections`.
create policy "agents_insert_admin"
  on public.agents for insert
  to authenticated
  with check (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

create policy "agents_update_admin"
  on public.agents for update
  to authenticated
  using (public.has_site_role(site_id, array['owner','admin']::public.site_role[]))
  with check (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

-- Duyệt/từ chối một pending action là hành động hệ trọng nhất trong cả tính
-- năng này — chỉ admin. Không có policy INSERT: hàng `pending_actions` chỉ
-- được tạo bởi tool registry của agent qua `createAdminClient()` (task sau),
-- không bao giờ từ phiên người dùng.
create policy "pending_actions_update_admin"
  on public.pending_actions for update
  to authenticated
  using (
    exists (
      select 1 from public.agent_runs r
      where r.id = run_id
        and public.has_site_role(r.site_id, array['owner','admin']::public.site_role[])
    )
  )
  with check (
    exists (
      select 1 from public.agent_runs r
      where r.id = run_id
        and public.has_site_role(r.site_id, array['owner','admin']::public.site_role[])
    )
  );

-- Không thêm policy nào cho `agent_runs` — mọi ghi vào bảng này đi qua
-- `createAdminClient()` theo thiết kế (ngữ cảnh cron/manual-trigger không có
-- phiên người dùng), giống `metrics_daily`.
