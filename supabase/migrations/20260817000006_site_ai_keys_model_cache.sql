-- ============================================================================
-- site_ai_keys → cache danh sách model khả dụng của provider đang kết nối.
--
-- `available_models` là mảng string (tên model thật, lấy trực tiếp từ API
-- list-models của hãng — KHÔNG hardcode) — UI Cài đặt hiện dropdown từ đây
-- thay vì bắt gõ tay tên model chính xác. `models_fetched_at` null nghĩa là
-- chưa từng tải — UI vẫn cho gõ tay/tải trực tiếp trong trường hợp đó.
-- Refresh định kỳ qua cron (`refreshAllSiteAiModelCaches`,
-- `src/lib/data/site-ai-keys.ts`) — không cần tải lại mỗi lần mở dialog Cài
-- đặt.
-- ============================================================================

alter table public.site_ai_keys add column available_models jsonb not null default '[]';
alter table public.site_ai_keys add column models_fetched_at timestamptz;
