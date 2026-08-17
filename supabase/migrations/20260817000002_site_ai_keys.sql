-- ============================================================================
-- Claude API Key do từng Site tự khai báo
--
-- Cùng lý do với site_oauth_apps (migration 006): mỗi Site có thể muốn dùng
-- tài khoản/billing Anthropic riêng thay vì dùng chung biến môi trường
-- ANTHROPIC_API_KEY của cả app. `resolveClaudeApiKey` (lib/data/site-ai-keys.ts)
-- vẫn fallback về biến môi trường đó khi Site chưa tự cấu hình, nên các
-- deploy/dev hiện tại dựa vào env var không bị hỏng.
--
-- `provider` giữ nguyên quy ước family/provider-column của các bảng bí mật
-- theo-site khác trong hệ thống (site_oauth_apps.family) dù hiện chỉ có một
-- giá trị — không có lý do đặc cách bảng này, và mở rộng sau này (nếu có
-- provider AI khác) sẽ không cần đổi khoá chính.
-- ============================================================================

create table public.site_ai_keys (
  site_id      uuid not null references public.sites (id) on delete cascade,
  provider     text not null default 'anthropic' check (provider = 'anthropic'),
  api_key_enc  text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  primary key (site_id, provider)
);

-- ============================================================================
-- Két giống hệt site_oauth_apps/connection_secrets: RLS bật, CỐ TÌNH không có
-- policy nào. Claude API Key cho phép chi tiêu vào tài khoản Anthropic của
-- Site đó, nên đường đọc phải hẹp như token OAuth thật — chỉ service_role
-- chạm được.
--
-- Ai được phép GHI qua giao diện web do Server Action tự kiểm tra bằng RPC
-- has_site_role(site_id, ['owner','admin']) (định nghĩa ở migration 001)
-- trước khi chuyển sang client service_role. Không có policy nào giả vờ mở
-- hé cho vai trò "authenticated".
-- ============================================================================
alter table public.site_ai_keys enable row level security;

-- KHÔNG có policy cho site_ai_keys. Đọc kỹ khối trên trước khi thêm một cái.
