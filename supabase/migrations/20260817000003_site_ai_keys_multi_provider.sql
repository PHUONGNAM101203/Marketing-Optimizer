-- ============================================================================
-- site_ai_keys → hỗ trợ nhiều nhà cung cấp AI (Claude/OpenAI/Gemini), MỘT cái
-- kết nối tại một thời điểm cho mỗi Site.
--
-- Đổi khoá chính từ (site_id, provider) sang chỉ site_id — biến "tối đa một
-- provider đang kết nối" thành ràng buộc DATABASE, không chỉ quy ước ứng
-- dụng. An toàn để đổi: từ trước tới giờ chỉ 'anthropic' từng tồn tại, nên
-- không Site nào có quá một hàng, không có xung đột dữ liệu khi drop khoá cũ.
-- ============================================================================

alter table public.site_ai_keys drop constraint site_ai_keys_pkey;
alter table public.site_ai_keys add primary key (site_id);

alter table public.site_ai_keys drop constraint site_ai_keys_provider_check;
alter table public.site_ai_keys add constraint site_ai_keys_provider_check
  check (provider in ('anthropic', 'openai', 'gemini'));

-- Model là text tự do, KHÔNG danh sách cứng — tên model đổi liên tục theo
-- từng hãng, một danh sách cố định trong migration/UI sẽ lỗi thời rất nhanh.
alter table public.site_ai_keys add column model text not null default '';
