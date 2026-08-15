-- ============================================================================
-- RPC lấy đúng số dòng cần thiết cho "top mọi thời gian"/"tăng nhanh" của
-- Facebook/Instagram, cùng thiết kế với `get_video_trending_snapshots`
-- (20260814000004/5) NHƯNG áp dụng bài học ngay từ đầu: MỘT dòng MỖI BÀI
-- ĐĂNG (không phải một dòng mỗi bài×vai-trò/UNION) — bản TikTok ban đầu dùng
-- UNION rồi phải sửa lại vì vẫn chạm trần `max_rows` (1000) của PostgREST ở
-- quy mô vài trăm video, không lặp lại lỗi đó ở đây.
--
-- Nhận thêm `p_provider` (khác bản TikTok) — bảng `content_metrics_daily`
-- dùng chung facebook+instagram, một connection chỉ bao giờ cần đọc ĐÚNG
-- MỘT provider tại một thời điểm (trang chi tiết kênh là facebook HOẶC
-- instagram, không bao giờ cả hai cùng lúc).
--
-- Trả `earliest_score`/`cutoffN_score` (TỔNG likes+comments+shares đã cộng
-- sẵn trong SQL) thay vì trả riêng 3 cột như bản TikTok trả riêng `views` —
-- TikTok chỉ có một con số (views) nên không cần cộng; ở đây engagement là
-- tổng 3 con số, nếu trả riêng cho cả 4 vai trò (earliest + 3 cutoff) sẽ
-- thành 12 cột thay vì 4. Role `latest` vẫn trả đủ 3 cột riêng
-- (latest_likes/comments/shares) vì đó là con số THẬT sự hiển thị, không chỉ
-- dùng để tính delta.
--
-- security invoker (mặc định, khai báo tường minh) + `set search_path = ''`
-- + revoke/grant tường minh — cùng quy ước bảo mật mọi hàm khác trong repo.
-- ============================================================================

create function public.get_content_trending_snapshots(
  p_connection_id uuid,
  p_provider text,
  p_cutoffs date[]
)
returns table (
  external_post_id text,
  message text,
  image_url text,
  permalink text,
  latest_date date,
  latest_likes bigint,
  latest_comments bigint,
  latest_shares bigint,
  earliest_date date,
  earliest_score bigint,
  cutoff0_date date,
  cutoff0_score bigint,
  cutoff1_date date,
  cutoff1_score bigint,
  cutoff2_date date,
  cutoff2_score bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (external_post_id)
      external_post_id, date, likes, comments, shares, message, image_url, permalink
    from public.content_metrics_daily
    where connection_id = p_connection_id and provider = p_provider
    order by external_post_id, date desc
  ),
  earliest as (
    select distinct on (external_post_id)
      external_post_id, date, likes + comments + shares as score
    from public.content_metrics_daily
    where connection_id = p_connection_id and provider = p_provider
    order by external_post_id, date asc
  ),
  -- Mỗi bài đăng có TỐI ĐA một dòng cho mỗi mốc cắt (window_index 0/1/2
  -- tương ứng tuần/tháng/năm, khớp thứ tự `p_cutoffs` phía TypeScript truyền
  -- vào — xem `TRENDING_WINDOW_KEYS` trong `src/lib/data/content-trending.ts`).
  cutoff_rows as (
    select c.idx - 1 as window_index, v.external_post_id, v.date, v.score
    from unnest(p_cutoffs) with ordinality as c(cutoff, idx)
    cross join lateral (
      select distinct on (external_post_id)
        external_post_id, date, likes + comments + shares as score
      from public.content_metrics_daily
      where connection_id = p_connection_id and provider = p_provider and date <= c.cutoff
      order by external_post_id, date desc
    ) v
  )
  select
    l.external_post_id,
    l.message,
    l.image_url,
    l.permalink,
    l.date, l.likes, l.comments, l.shares,
    e.date, e.score,
    c0.date, c0.score,
    c1.date, c1.score,
    c2.date, c2.score
  from latest l
  left join earliest e on e.external_post_id = l.external_post_id
  left join cutoff_rows c0 on c0.external_post_id = l.external_post_id and c0.window_index = 0
  left join cutoff_rows c1 on c1.external_post_id = l.external_post_id and c1.window_index = 1
  left join cutoff_rows c2 on c2.external_post_id = l.external_post_id and c2.window_index = 2
  order by (l.likes + l.comments + l.shares) desc
$$;

revoke all on function public.get_content_trending_snapshots(uuid, text, date[]) from public;
grant execute on function public.get_content_trending_snapshots(uuid, text, date[]) to authenticated;
