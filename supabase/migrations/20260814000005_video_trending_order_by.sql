-- ============================================================================
-- `get_video_trending_snapshots` không có ORDER BY ở SELECT cuối. Không sai
-- (TypeScript tự sort/tính min-max không phụ thuộc thứ tự), nhưng nếu số
-- video theo dõi CỘNG DỒN của một connection vượt max_rows (1000) — hoàn
-- toàn có thể xảy ra vì `sync-video-snapshots.ts` chỉ upsert, không xoá
-- lịch sử, nên số video phân biệt tăng dần theo thời gian dù mỗi lượt sync
-- chỉ thấy tối đa 20 video gần nhất mỗi trang — PostgREST cắt bớt kết quả
-- mà KHÔNG báo lỗi, và video nào bị cắt là ngẫu nhiên (đổi khác nhau giữa
-- các lần tải trang) vì thiếu sắp xếp. Thêm `order by` để nếu có cắt bớt
-- thật, luôn cắt đúng video ít view nhất trước — hợp lý hơn cắt ngẫu nhiên,
-- và ổn định giữa các lần gọi.
-- ============================================================================

create or replace function public.get_video_trending_snapshots(
  p_connection_id uuid,
  p_cutoffs date[]
)
returns table (
  external_video_id text,
  title text,
  cover_image_url text,
  latest_date date,
  latest_views bigint,
  latest_likes bigint,
  latest_comments bigint,
  latest_shares bigint,
  earliest_date date,
  earliest_views bigint,
  cutoff0_date date,
  cutoff0_views bigint,
  cutoff1_date date,
  cutoff1_views bigint,
  cutoff2_date date,
  cutoff2_views bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (external_video_id)
      external_video_id, date, views, likes, comments, shares, title, cover_image_url
    from public.video_metrics_daily
    where connection_id = p_connection_id
    order by external_video_id, date desc
  ),
  earliest as (
    select distinct on (external_video_id)
      external_video_id, date, views
    from public.video_metrics_daily
    where connection_id = p_connection_id
    order by external_video_id, date asc
  ),
  cutoff_rows as (
    select c.idx - 1 as window_index, v.external_video_id, v.date, v.views
    from unnest(p_cutoffs) with ordinality as c(cutoff, idx)
    cross join lateral (
      select distinct on (external_video_id)
        external_video_id, date, views
      from public.video_metrics_daily
      where connection_id = p_connection_id and date <= c.cutoff
      order by external_video_id, date desc
    ) v
  )
  select
    l.external_video_id,
    l.title,
    l.cover_image_url,
    l.date, l.views, l.likes, l.comments, l.shares,
    e.date, e.views,
    c0.date, c0.views,
    c1.date, c1.views,
    c2.date, c2.views
  from latest l
  left join earliest e on e.external_video_id = l.external_video_id
  left join cutoff_rows c0 on c0.external_video_id = l.external_video_id and c0.window_index = 0
  left join cutoff_rows c1 on c1.external_video_id = l.external_video_id and c1.window_index = 1
  left join cutoff_rows c2 on c2.external_video_id = l.external_video_id and c2.window_index = 2
  order by l.views desc
$$;

revoke all on function public.get_video_trending_snapshots(uuid, date[]) from public;
grant execute on function public.get_video_trending_snapshots(uuid, date[]) to authenticated;
