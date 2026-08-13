-- ============================================================================
-- OAuth app do từng Site tự khai báo
--
-- Đổi so với thiết kế lúc đầu (một cặp Client ID/Secret dùng chung toàn app):
-- mỗi Site tự tạo OAuth Client riêng trên Google Cloud Console (hoặc Meta for
-- Developers) và nhập vào đây. Site A và Site B không dùng chung một app —
-- không ai chạm vào quota hay phạm vi quyền của ai.
-- ============================================================================

create table public.site_oauth_apps (
  site_id            uuid not null references public.sites (id) on delete cascade,
  family             text not null check (family in ('google', 'meta', 'tiktok')),
  client_id_enc      text not null,
  client_secret_enc  text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id) on delete set null,
  primary key (site_id, family)
);

-- ============================================================================
-- Két giống hệt connection_secrets (migration 003): RLS bật, CỐ TÌNH không có
-- policy nào. Client Secret cho phép mạo danh Site đó trước Google/Meta, nên
-- đường đọc phải hẹp như token thật — chỉ service_role chạm được.
--
-- Ai được phép GHI qua giao diện web do Server Action tự kiểm tra bằng RPC
-- has_site_role(site_id, ['owner','admin']) (định nghĩa ở migration 001)
-- trước khi chuyển sang client service_role. Không có policy nào giả vờ mở
-- hé cho vai trò "authenticated" — nếu có, đó là chỗ RLS "tưởng an toàn"
-- nhưng thật ra không, vì WITH CHECK không phân biệt được ai đang ghi thay
-- cho Site nào một khi role thường đã có mặt ở đây.
-- ============================================================================
alter table public.site_oauth_apps enable row level security;

-- KHÔNG có policy cho site_oauth_apps. Đọc kỹ khối trên trước khi thêm một cái.
