-- ============================================================================
-- `get_content_trending_snapshots` cần trả thêm `latest_posted_at` (thời điểm
-- bài đăng thật được tạo, cột `posted_at` vừa thêm ở 20260814000008) để lớp
-- đọc TypeScript điền được `ContentSummary.createdAt` theo đúng contract đã
-- chốt với phía UI. Đổi hình dạng cột trả về → phải DROP rồi mới CREATE lại
-- (`create or replace function` không cho đổi kiểu trả về) — cùng bài học đã
-- trả giá ở `get_video_trending_snapshots`.
-- ============================================================================

drop function if exists public.get_content_trending_snapshots(uuid, text, date[]);

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
  latest_posted_at timestamptz,
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
      external_post_id, date, likes, comments, shares, message, image_url, permalink, posted_at
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
    l.posted_at,
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
