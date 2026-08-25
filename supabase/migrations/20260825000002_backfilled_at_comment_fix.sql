-- ============================================================================
-- Sửa mô tả cột `connections.backfilled_at`
--
-- Migration 20260825000001 mô tả cột này là "luôn NULL với provider snapshot".
-- Cách hiểu đó sai trong thực tế: hai route cron chọn connection theo
-- `backfilled_at.is.null`, nên để NULL vĩnh viễn cho merchant-center/tiktok
-- đồng nghĩa chúng khớp điều kiện ở MỌI lượt chạy và bộ lọc `last_synced_at`
-- thành vô nghĩa với riêng nhóm đó.
--
-- Ngữ nghĩa đúng: "đã XỬ LÝ XONG việc nạp lịch sử". Với nhóm snapshot, kết
-- luận là không có gì để nạp — vẫn là đã xử lý xong, nên vẫn đóng dấu.
-- Migration cũ đã áp lên remote nên không sửa tại chỗ được, phải nối file này.
-- ============================================================================

comment on column public.connections.backfilled_at is
  'Thời điểm ĐÃ XỬ LÝ XONG việc nạp dữ liệu lịch sử. NULL = chưa xử lý, cron sẽ xử lý ở lượt kế tiếp. Provider snapshot (merchant-center, tiktok) vẫn được đóng dấu dù không nạp gì: nền tảng không có báo cáo lịch sử để nạp, và kết luận đó cũng là đã xử lý xong.';
