-- ============================================================================
-- M2 · Nền tảng: hồ sơ người dùng, Site, thành viên Site
--
-- Site là thực thể gốc của cả sản phẩm. Mọi thứ về sau — kết nối, số liệu,
-- đề xuất, agent — đều treo dưới site_id và thừa hưởng đúng mô hình quyền
-- được định nghĩa ở file này.
-- ============================================================================

-- ─── Vai trò ────────────────────────────────────────────────────────────────
create type public.site_role as enum ('owner', 'admin', 'viewer');

-- ─── Hồ sơ ──────────────────────────────────────────────────────────────────
-- Bảng riêng thay vì đụng vào auth.users: auth.users do Supabase quản, thêm
-- cột vào đó sẽ vỡ khi họ nâng cấp schema.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  locale      text not null default 'vi',
  created_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Thông tin hiển thị của người dùng. Khoá chính trùng auth.users.id.';

-- ─── Site ───────────────────────────────────────────────────────────────────
create table public.sites (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  url         text not null check (url ~* '^https?://'),
  -- Host đã chuẩn hoá, bỏ www. Dùng để khớp với property của GSC và GA4.
  domain      text not null check (domain ~* '^[a-z0-9.-]+\.[a-z]{2,}$'),
  timezone    text not null default 'Asia/Ho_Chi_Minh',
  -- ISO 4217. Mọi giá trị tiền của Site được hiểu theo đơn vị này.
  currency    char(3) not null default 'VND',
  created_at  timestamptz not null default now()
);

-- Một người không nên tạo trùng cùng một domain hai lần; hai người khác nhau
-- thì được, vì họ có thể cùng làm cho một website.
create unique index sites_owner_domain_key on public.sites (owner_id, lower(domain));
create index sites_owner_idx on public.sites (owner_id);

-- ─── Thành viên ─────────────────────────────────────────────────────────────
create table public.site_members (
  site_id    uuid not null references public.sites (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.site_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (site_id, user_id)
);

create index site_members_user_idx on public.site_members (user_id);

-- ============================================================================
-- Hàm trợ giúp quyền
--
-- SECURITY DEFINER là BẮT BUỘC ở đây, không phải tuỳ chọn.
-- Policy của `sites` cần đọc `site_members`, mà `site_members` cũng có policy
-- đọc chính nó → Postgres rơi vào đệ quy vô hạn và mọi truy vấn đều lỗi.
-- Hàm SECURITY DEFINER chạy bỏ qua RLS nên cắt được vòng lặp.
--
-- `set search_path = ''` cũng bắt buộc: không có nó, kẻ tấn công tạo được một
-- schema trùng tên trong search_path và chiếm quyền thực thi của hàm.
-- ============================================================================

create or replace function public.is_site_member(target_site uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.site_members
    where site_id = target_site
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.has_site_role(
  target_site uuid,
  allowed public.site_role[]
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.site_members
    where site_id = target_site
      and user_id = (select auth.uid())
      and role = any (allowed)
  );
$$;

revoke all on function public.is_site_member(uuid) from public;
revoke all on function public.has_site_role(uuid, public.site_role[]) from public;
grant execute on function public.is_site_member(uuid) to authenticated;
grant execute on function public.has_site_role(uuid, public.site_role[]) to authenticated;

-- ============================================================================
-- Row Level Security
-- Bật trên MỌI bảng. Bảng không bật RLS trong schema public là bảng ai cũng
-- đọc được qua API tự sinh của Supabase.
-- ============================================================================

alter table public.profiles     enable row level security;
alter table public.sites        enable row level security;
alter table public.site_members enable row level security;

-- ─── profiles ───────────────────────────────────────────────────────────────
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ─── sites ──────────────────────────────────────────────────────────────────
create policy "sites_select_member"
  on public.sites for select
  to authenticated
  using (public.is_site_member(id));

-- Chỉ tự tạo Site cho chính mình. Không có dòng WITH CHECK này thì một người
-- tạo được Site rồi gán owner_id cho người khác.
create policy "sites_insert_self"
  on public.sites for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "sites_update_admin"
  on public.sites for update
  to authenticated
  using (public.has_site_role(id, array['owner', 'admin']::public.site_role[]))
  with check (public.has_site_role(id, array['owner', 'admin']::public.site_role[]));

-- Xoá Site là hành động không hoàn tác được, chỉ chủ sở hữu.
create policy "sites_delete_owner"
  on public.sites for delete
  to authenticated
  using (public.has_site_role(id, array['owner']::public.site_role[]));

-- ─── site_members ───────────────────────────────────────────────────────────
create policy "site_members_select_member"
  on public.site_members for select
  to authenticated
  using (public.is_site_member(site_id));

create policy "site_members_write_admin"
  on public.site_members for insert
  to authenticated
  with check (public.has_site_role(site_id, array['owner', 'admin']::public.site_role[]));

create policy "site_members_update_admin"
  on public.site_members for update
  to authenticated
  using (public.has_site_role(site_id, array['owner', 'admin']::public.site_role[]))
  with check (public.has_site_role(site_id, array['owner', 'admin']::public.site_role[]));

create policy "site_members_delete_admin"
  on public.site_members for delete
  to authenticated
  using (public.has_site_role(site_id, array['owner', 'admin']::public.site_role[]));

-- ============================================================================
-- Trigger
-- ============================================================================

-- Tạo hồ sơ ngay khi có tài khoản mới. Làm ở tầng database chứ không ở tầng
-- ứng dụng: người dùng đăng ký qua Google OAuth không đi qua mã ứng dụng của
-- ta, nên nếu đặt ở đó sẽ có tài khoản không có hồ sơ.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Người tạo Site tự động thành owner. Nếu để ứng dụng chèn dòng này thì có
-- một khoảnh khắc Site tồn tại mà chưa ai là thành viên — và trong khoảnh
-- khắc đó chính người vừa tạo cũng không đọc được nó, vì policy select yêu
-- cầu phải là thành viên.
create or replace function public.handle_new_site()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.site_members (site_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (site_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_site_created
  after insert on public.sites
  for each row execute function public.handle_new_site();
