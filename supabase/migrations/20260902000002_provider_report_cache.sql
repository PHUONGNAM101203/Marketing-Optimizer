-- ============================================================================
-- `provider_report_cache` — giữ lại kết quả báo cáo đã lấy được từ API nền tảng
--
-- Vì sao cần, dù đã có `unstable_cache` ở tầng provider: cache đó nằm trong bộ
-- nhớ/lớp cache của Next, mất sạch sau mỗi lần triển khai và tự hết hạn. Mỗi
-- lần mất là một người dùng phải gánh trọn lượt gọi nguội — với Klaviyo là bốn
-- lượt TUẦN TỰ vào Reporting API (giới hạn ~1 request/giây), đủ chạm trần 20
-- giây và hiện ra lỗi "The operation was aborted due to timeout" thay vì số
-- liệu, đúng như người dùng gặp ngày 2/9/2026.
--
-- Lưu xuống database đổi hẳn tính chất: số đã lấy được MỘT LẦN thì còn mãi.
-- Lần sau đọc thẳng từ đây, và quan trọng hơn — khi API nền tảng lỗi hoặc quá
-- chậm, vẫn còn số cũ để hiện. Số hơi cũ tốt hơn hẳn một khung báo lỗi.
--
-- `cache_key` gói cả loại báo cáo lẫn khoảng ngày (vd.
-- `klaviyo:performance:2026-08-09:2026-09-05`) vì báo cáo của Klaviyo là tổng
-- theo khoảng, không phải theo ngày — không tách nhỏ ra từng ngày được để cộng
-- lại.
--
-- KHÔNG lưu kết quả lỗi: `payload` chỉ ghi khi lượt gọi thành công thật. Lưu cả
-- lỗi thì lần sau đọc ra một "kết quả" rỗng và không còn biết đó là lỗi.
-- ============================================================================

create table if not exists public.provider_report_cache (
  connection_id uuid not null references public.connections(id) on delete cascade,
  cache_key text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (connection_id, cache_key)
);

alter table public.provider_report_cache enable row level security;

-- Không policy nào: chỉ mã phía server đọc/ghi bảng này, và luôn bằng
-- `service_role` (xem `createAdminClient`) vốn bỏ qua RLS. Quyền truy cập của
-- người dùng đã được kiểm ở tầng trên bằng chính connection họ đang xem — đúng
-- khuôn `connection_secrets` và `media_backfill_failures`.

comment on table public.provider_report_cache is
  'Kết quả báo cáo đã lấy được từ API nền tảng, giữ lại để lần sau khỏi gọi lại và để còn số cũ khi API lỗi. Xem migration 20260902000002.';
