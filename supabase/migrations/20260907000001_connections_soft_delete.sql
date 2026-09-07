-- ============================================================================
-- `connections.disconnected_at` — gỡ kết nối là ĐÁNH DẤU, không xoá
--
-- Vì sao: ngày 7/9/2026 một kết nối TikTok bị xoá cùng 1.877 hàng lịch sử
-- snapshot. Khôi phục được, nhưng cái giá là hai lượt phục hồi toàn bộ database
-- từ bản sao lưu hằng ngày: mất một ngày dữ liệu của MỌI kênh, database ngưng
-- vài phút, hai migration bị lùi mất phải chạy lại, và 575 hàng phải nạp tay.
-- Tất cả chỉ để lấy lại MỘT kết nối.
--
-- Nguyên nhân lần đó là một bug đã sửa, nhưng rủi ro không nằm ở riêng bug đó:
-- nút "Ngắt kết nối" cũng xoá thật, xoá luôn toàn bộ lịch sử qua ràng buộc
-- `on delete cascade`, và KHÔNG CÓ nút hoàn tác. Bấm nhầm một cái là mất y hệt.
--
-- Cột này đổi bản chất của việc gỡ: hàng ở nguyên, lịch sử ở nguyên, kết nối
-- chỉ biến mất khỏi giao diện. Khôi phục là xoá dấu — cùng `id` cũ nên mọi số
-- liệu tự gắn lại, không cần chép hay ghép gì. Dọn thật chỉ xảy ra sau
-- `CONNECTION_PURGE_DAYS` ngày, ở cron hằng ngày.
--
-- KHÔNG dùng view lọc sẵn để khỏi phải sửa nơi đọc: `connections` nằm trong
-- publication `supabase_realtime` (migration 20260822000001) mà Realtime không
-- phát sự kiện cho view, và đổi bảng thành view còn làm codegen xếp nó sang
-- nhóm `Views` khiến kiểu dữ liệu ở hàng chục chỗ đổi theo. Thêm bộ lọc vào 19
-- truy vấn liệt kê là việc cơ học, rủi ro thấp hơn hẳn — và nếu sót một chỗ thì
-- hậu quả chỉ là một kết nối đã gỡ hiện nhầm, không phải mất dữ liệu.
-- ============================================================================

alter table public.connections
  add column if not exists disconnected_at timestamptz;

comment on column public.connections.disconnected_at is
  'Thời điểm người dùng gỡ kết nối. NULL = đang dùng. Hàng và toàn bộ lịch sử giữ nguyên để khôi phục được; xem migration 20260907000001.';

-- Mọi truy vấn liệt kê đều lọc `disconnected_at is null`, nên index một phần
-- đúng bằng tập hàng đang dùng — nhỏ hơn nhiều so với index cả cột.
create index if not exists connections_active_site_idx
  on public.connections (site_id, provider)
  where disconnected_at is null;
