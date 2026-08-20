-- ============================================================================
-- `get_video_trending_snapshots`/`get_video_range_snapshots` cần trả thêm
-- `posted_at`/`permalink_url` (cột vừa thêm ở 20260820000001) để lớp đọc
-- TypeScript điền được `VideoSummary.createdAt`/`permalinkUrl` — cùng lý do
-- và cùng kỹ thuật đã dùng cho `get_content_trending_snapshots` (xem
-- `20260814000009_content_trending_posted_at.sql`). Đổi hình dạng cột trả về
-- → phải DROP rồi mới CREATE lại (`create or replace function` không cho đổi
-- kiểu trả về) — cùng bài học đã trả giá ở lần đổi hình dạng trước (xem
-- `20260814000005_video_trending_order_by.sql`).
--
-- Chỉ lấy từ dòng MỚI NHẤT (latest/end) — `posted_at` là thuộc tính tĩnh của
-- video (không đổi giữa các ngày snapshot), không cần lấy ở baseline_row của
-- `get_video_range_snapshots`.
-- ============================================================================

drop function if exists public.get_video_trending_snapshots(uuid, date[]);

create function public.get_video_trending_snapshots(
  p_connection_id uuid,
  p_cutoffs date[]
)
returns table (
  external_video_id text,
  title text,
  cover_image_url text,
  posted_at timestamptz,
  permalink_url text,
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
      external_video_id, date, views, likes, comments, shares, title, cover_image_url,
      posted_at, permalink_url
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
    l.posted_at,
    l.permalink_url,
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
$$;

revoke all on function public.get_video_trending_snapshots(uuid, date[]) from public;
grant execute on function public.get_video_trending_snapshots(uuid, date[]) to authenticated;

drop function if exists public.get_video_range_snapshots(uuid, date, date);

create function public.get_video_range_snapshots(
  p_connection_id uuid,
  p_range_start date,
  p_range_end date
)
returns table (
  external_video_id text,
  title text,
  cover_image_url text,
  posted_at timestamptz,
  permalink_url text,
  end_date date,
  end_views bigint,
  end_likes bigint,
  end_comments bigint,
  end_shares bigint,
  baseline_date date,
  baseline_views bigint,
  baseline_likes bigint,
  baseline_comments bigint,
  baseline_shares bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with end_row as (
    select distinct on (external_video_id)
      external_video_id, date, views, likes, comments, shares, title, cover_image_url,
      posted_at, permalink_url
    from public.video_metrics_daily
    where connection_id = p_connection_id and date <= p_range_end
    order by external_video_id, date desc
  ),
  baseline_row as (
    select distinct on (external_video_id)
      external_video_id, date, views, likes, comments, shares
    from public.video_metrics_daily
    where connection_id = p_connection_id and date < p_range_start
    order by external_video_id, date desc
  )
  select
    e.external_video_id,
    e.title,
    e.cover_image_url,
    e.posted_at,
    e.permalink_url,
    e.date, e.views, e.likes, e.comments, e.shares,
    b.date, b.views, b.likes, b.comments, b.shares
  from end_row e
  left join baseline_row b on b.external_video_id = e.external_video_id
$$;

revoke all on function public.get_video_range_snapshots(uuid, date, date) from public;
grant execute on function public.get_video_range_snapshots(uuid, date, date) to authenticated;
