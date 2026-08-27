-- ============================================================================
-- `backfill_media_targets()` — lan URL ảnh nội bộ ra hàng cũ, rồi trả về phần
-- thật sự còn phải tải
--
-- Vì sao cần: mỗi video/bài có MỘT hàng snapshot mỗi ngày, tất cả trỏ về CÙNG
-- một ảnh. Việc chép ảnh lúc đồng bộ chỉ ghi URL nội bộ vào hàng của NGÀY HÔM
-- ĐÓ, nên các hàng cũ của chính video đó vẫn giữ link CDN đã chết. Đo thật ngày
-- 27/8/2026: 17 hàng đã dùng URL nội bộ, 980 hàng còn link ngoài — mà phần lớn
-- 980 hàng đó thuộc về những video ĐÃ CÓ ảnh trong Storage rồi.
--
-- Nghĩa là phần lớn không cần tải lại gì cả, chỉ cần chép URL sang. Làm bằng
-- một câu `update ... from` chạy trong database thay vì hàng trăm lượt gọi
-- PostgREST từ Node: nhanh hơn nhiều bậc và không tốn hạn mức mỗi lượt cron.
--
-- Chỉ phần CÒN LẠI — video mà TikTok không còn trả về nên chưa từng được chép —
-- mới phải tải từ CDN, và đó là danh sách hàm này trả về.
--
-- Vì sao trả danh sách từ đây chứ không tự truy vấn trong Node: `distinct on`
-- chọn hàng mới nhất mỗi video là thứ PostgREST không phơi ra. Làm phía Node
-- phải kéo tối đa 1000 hàng rồi tự khử trùng lặp — sai ngay khi số hàng vượt
-- 1000, và số hàng thì tăng mỗi ngày theo đúng thiết kế của bảng snapshot.
-- ============================================================================

create or replace function public.backfill_media_targets()
returns table (kind text, external_id text, source_url text)
language plpgsql
security definer
set search_path = public
as $$
declare
  mirrored_pattern constant text := '%/storage/v1/object/public/media/%';
begin
  -- Lan URL nội bộ của hàng mới nhất ra MỌI hàng cũ của cùng video.
  update video_metrics_daily v
  set cover_image_url = newest.url
  from (
    select distinct on (external_video_id)
      external_video_id, cover_image_url as url
    from video_metrics_daily
    where cover_image_url is not null
    order by external_video_id, date desc
  ) newest
  where v.external_video_id = newest.external_video_id
    and newest.url like mirrored_pattern
    -- `is distinct from` chứ không phải `<>`: `<>` với NULL trả về NULL nên
    -- hàng chưa có ảnh sẽ bị bỏ sót.
    and v.cover_image_url is distinct from newest.url;

  update content_metrics_daily c
  set image_url = newest.url
  from (
    select distinct on (external_post_id)
      external_post_id, image_url as url
    from content_metrics_daily
    where image_url is not null
    order by external_post_id, date desc
  ) newest
  where c.external_post_id = newest.external_post_id
    and newest.url like mirrored_pattern
    and c.image_url is distinct from newest.url;

  -- Phần còn lại: hàng mới nhất VẪN là link ngoài, tức chưa từng chép được.
  return query
  select 'video'::text, n.external_video_id, n.url
  from (
    select distinct on (external_video_id)
      external_video_id, cover_image_url as url
    from video_metrics_daily
    where cover_image_url is not null
    order by external_video_id, date desc
  ) n
  where n.url not like mirrored_pattern
  union all
  select 'post'::text, n.external_post_id, n.url
  from (
    select distinct on (external_post_id)
      external_post_id, image_url as url
    from content_metrics_daily
    where image_url is not null
    order by external_post_id, date desc
  ) n
  where n.url not like mirrored_pattern;
end;
$$;

-- Chỉ cron gọi, mà cron dùng `service_role`. Thu hồi tường minh khỏi các role
-- người dùng: hàm này GHI dữ liệu và chạy `security definer` — cùng lý do đã
-- ghi ở migration 20260822000002.
revoke all on function public.backfill_media_targets() from public, anon, authenticated;

comment on function public.backfill_media_targets() is
  'Lan URL ảnh nội bộ ra các hàng snapshot cũ, trả về những video/bài thật sự còn phải tải từ CDN. Xem migration 20260827000003.';
