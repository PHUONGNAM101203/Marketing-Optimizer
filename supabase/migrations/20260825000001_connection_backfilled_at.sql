-- ============================================================================
-- `connections.backfilled_at` — đã nạp lịch sử cho connection này chưa
--
-- Vấn đề: `syncConnection` luôn chỉ kéo `SYNC_WINDOW_DAYS = 30` ngày gần nhất,
-- nên `metrics_daily` KHÔNG BAO GIỜ có dữ liệu cũ hơn 30 ngày tính từ lượt
-- đồng bộ đầu tiên. Chọn một khoảng so sánh xa hơn thế (vd. tháng 6) ra 0 ở
-- MỌI kênh — không phải lỗi truy vấn, mà là dữ liệu chưa từng được ghi.
--
-- Đã kiểm chứng bằng cách hỏi thẳng API nền tảng khoảng 01–30/06/2026
-- (25/8/2026): GA4 trả 30 hàng/property với sessions thật (126, 162, 4414,
-- 489), Search Console trả 29–30 hàng với clicks thật (17, 32, 2, 3),
-- Facebook 29 hàng. Dữ liệu vẫn còn nguyên ở phía nền tảng — chỉ là ta chưa
-- bao giờ đi lấy.
--
-- Cột này để việc nạp chạy ĐÚNG MỘT LẦN cho mỗi connection: cron thấy `null`
-- thì nạp cửa sổ rộng rồi đóng dấu, các lượt sau quay về cửa sổ 30 ngày bình
-- thường. Không nới thẳng `SYNC_WINDOW_DAYS` lên 365 vì như vậy MỌI lượt đồng
-- bộ hằng giờ đều kéo lại cả năm dữ liệu — tốn quota API và thời gian cron cho
-- phần đã có sẵn.
--
-- LƯU Ý cho người đọc sau: `merchant-center` và `tiktok` CỐ TÌNH không được
-- nạp (xem `SNAPSHOT_PROVIDERS` trong `domain/providers.ts`). API của hai nền
-- tảng đó không có báo cáo lịch sử — hỏi khoảng ngày quá khứ thì chúng vẫn trả
-- về TRẠNG THÁI HIỆN TẠI, chỉ gắn nhãn ngày cuối khoảng. Nạp là ghi số của hôm
-- nay xuống quá khứ, tức bịa lịch sử. Đã xác nhận qua cùng lượt đo trên: cả
-- hai trả đúng 1 hàng gắn nhãn 2026-06-30.
-- ============================================================================

alter table public.connections add column backfilled_at timestamptz;

comment on column public.connections.backfilled_at is
  'Thời điểm đã nạp xong dữ liệu lịch sử (cửa sổ rộng). NULL = chưa nạp, cron sẽ nạp ở lượt kế tiếp. Luôn NULL với provider snapshot (merchant-center, tiktok) vì nền tảng không có lịch sử để nạp.';
