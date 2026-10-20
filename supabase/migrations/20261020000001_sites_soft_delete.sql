-- ============================================================================
-- `sites.deleted_at` — xoá website là ĐÁNH DẤU, không xoá
--
-- Vì sao: nút "Xoá website" ở trang Cài đặt trước nay là một nút CHẾT — không
-- `onClick`, không form, không action. Bấm vào không xảy ra gì. Nay nối nó vào
-- việc thật, và việc thật đó không được phép là một lệnh `delete` thẳng.
--
-- `sites` là gốc của cây xoá lan: xoá một hàng ở đây cuốn theo `connections`,
-- rồi từ `connections` cuốn tiếp toàn bộ `metrics_daily`,
-- `video_metrics_daily`, `content_metrics_daily`, `connection_secrets`. Nghĩa
-- là một cú bấm nhầm xoá sạch nhiều hơn hẳn sự cố ngày 7/9/2026 — lần đó chỉ
-- mất một kết nối TikTok cùng 1.877 hàng lịch sử, và đã phải khôi phục toàn bộ
-- database từ bản sao lưu hai lượt mới lấy lại được.
--
-- Nguy hơn nữa kể từ bây giờ: project đang chuyển sang tổ chức gói Free, nơi
-- KHÔNG có sao lưu hằng ngày. Đường cứu của tháng 9 sẽ không còn.
--
-- Cùng khuôn `connections.disconnected_at` (migration 20260907000001), cố ý
-- vậy: một khái niệm "đã gỡ nhưng còn cứu được" cho cả hai tầng, không phải
-- hai cơ chế rời rạc. Khi xoá site, mọi connection còn sống của nó được đánh
-- dấu bằng ĐÚNG mốc thời gian đó — nhờ vậy lúc khôi phục phân biệt được
-- connection "bị kéo theo site" với connection người dùng đã tự gỡ trước đó,
-- và chỉ hồi sinh nhóm thứ nhất.
--
-- Dọn thật sau 30 ngày ở cron hằng ngày. Khi đó mới cho xoá lan chạy.
-- ============================================================================

alter table public.sites
  add column if not exists deleted_at timestamptz;

comment on column public.sites.deleted_at is
  'Thời điểm người dùng xoá website. NULL = đang dùng. Hàng và toàn bộ dữ liệu con giữ nguyên để khôi phục được trong 30 ngày; xem migration 20261020000001.';

-- Mọi truy vấn liệt kê đều lọc `deleted_at is null`, nên index một phần đúng
-- bằng tập hàng đang dùng.
create index if not exists sites_active_idx
  on public.sites (id)
  where deleted_at is null;
