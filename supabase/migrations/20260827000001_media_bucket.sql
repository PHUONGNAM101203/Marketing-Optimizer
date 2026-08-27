-- ============================================================================
-- Bucket `media` — bản sao thumbnail video/bài đăng
--
-- Vì sao cần: URL thumbnail của TikTok là link CÓ CHỮ KÝ và HẾT HẠN. Không
-- phải suy đoán — đo thật ngày 27/8/2026 trên chính dữ liệu production: 6/6
-- ảnh ở snapshot MỚI NHẤT còn sống, 0/6 ảnh ở snapshot CŨ NHẤT còn sống (đều
-- trả về 544 bytes text/html thay vì ảnh). Nghĩa là chọn một khoảng ngày cũ
-- là thumbnail vỡ hết, và số ảnh chết tăng thêm mỗi ngày.
--
-- Chép ảnh về bucket này một lần rồi ghi URL của chính mình vào
-- `cover_image_url`/`image_url` khiến ảnh trở thành vĩnh viễn. Cũng gỡ luôn
-- nút thắt đã ghi nhận trước đó: không bật được `next/image` cho thumbnail vì
-- URL ngoài xoay vòng liên tục sẽ đốt hết hạn mức 5.000 ảnh/tháng của Vercel.
--
-- Vì sao Supabase Storage chứ không phải Cloudflare R2: Storage KHÔNG dùng đĩa
-- Postgres — đó là hạn mức riêng (100 GB trong gói Pro, hiện dùng 0 GB), nên
-- không có chuyện "tràn database". Toàn bộ nhu cầu đo được là ~321 ảnh duy
-- nhất, ~47 MB. R2 chỉ hơn ở chỗ egress miễn phí không giới hạn, mà egress
-- hiện tại là 0,107/250 GB — còn cách ngưỡng hơn hai nghìn lần. Thêm R2 lúc
-- này là thêm một nhà cung cấp và một bộ khoá để đổi lấy thứ đã trả tiền rồi.
--
-- Bucket để PUBLIC, không dùng signed URL: signed URL cũng hết hạn, tức tái
-- tạo đúng vấn đề đang sửa. Thumbnail vốn đã công khai trên CDN của
-- TikTok/Meta nên không có gì bí mật để bảo vệ, và URL cố định thì CDN lẫn
-- trình duyệt mới cache được.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Không thêm policy nào cho `storage.objects`:
--   - ĐỌC: bucket public được phục vụ qua endpoint `/object/public/...`, không
--     đi qua RLS.
--   - GHI: chỉ `syncConnection` ghi, và nó luôn dùng `service_role` (xem
--     `createAdminClient`), vốn bỏ qua RLS. Không phiên người dùng nào được
--     phép ghi vào đây — đúng khuôn "không có write policy" mà mọi bảng khác
--     trong repo đang theo.
