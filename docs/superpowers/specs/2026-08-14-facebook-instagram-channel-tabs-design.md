# Facebook + Instagram channel pages: Tổng quan / Dashboard tabs

> **Cập nhật phạm vi (sau khi viết bản đầu):** người dùng xác nhận trực tiếp
> giao phần UI Dashboard cho một phiên khác (đang build TikTok tabs) — phiên
> đó nhận toàn quyền UI. Phiên này (data layer) chỉ còn chịu trách nhiệm phần
> **data/snapshot/growth backend** — bảng `content_metrics_daily`, RPC
> `get_content_trending_snapshots`, hai fetcher phân trang, wiring sync, và
> field `trending` trên `ChannelDetail`. Phần "UI" bên dưới giữ lại làm THAM
> KHẢO thiết kế đã thống nhất ban đầu, nhưng phiên UI có toàn quyền đổi khác
> miễn giữ đúng contract `ContentSummary`/`ContentGrowthSummary`/
> `ContentTrendingResult` (`src/lib/providers/content-trending-types.ts`) —
> xem trao đổi trực tiếp giữa hai phiên, đã chốt contract này. Phần data layer
> đã triển khai xong, qua review độc lập, xem "Trạng thái triển khai" cuối
> file.

## Problem

Same ask as the TikTok channel page (see `2026-08-14-video-snapshot-pipeline-design.md`
and `2026-08-14-tiktok-channel-tabs-design.md`, both implemented and merged), now for
Facebook (Page organic content) and Instagram (Business account media): a
**Tổng quan** tab showing every post with its stats, and a **Dashboard** tab with
real ranking/trending numbers — same architecture, reusing as much of the TikTok
implementation as the data actually allows.

Per user: card style for Facebook/Instagram should be "more square and a bit wider"
than the TikTok/YouTube 9:16 dense grid — Instagram's media is naturally square/4:5,
Facebook posts are often text-only or landscape, so a 1:1-biased grid fits both better
than TikTok's tall grid.

## What's genuinely reusable vs. what's platform-specific

Confirmed by reading the existing implementation before designing this:

**Reusable as-is (no fork needed):**
- `VideoSummary` / `VideoGrowthSummary` / `VideoTrendingResult` / `VideoTrendingWindows`
  types (`src/lib/providers/video-trending-types.ts`) — field names are already generic
  (`externalVideoId`, `title`, `thumbnailUrl`, `views`, `likes`, `comments`, `shares`,
  `growthDelta`, `growthPct`) despite the file/type names saying "Video". Facebook
  posts and Instagram media map onto this shape directly (see field mapping below).
  Not renaming the file — same reasoning as not renaming `video_metrics_daily`: it's
  live, working code; a cosmetic rename is pure risk for zero behavior change.
- `TRENDING_WINDOW_DAYS`, `MIN_TRENDING_VIEWS`, `MAX_TOP_ALL_TIME`, `hasEnoughHistory()`
  — platform-agnostic constants/logic, used verbatim.
- `UrlTabs` (`src/components/ui/tabs.tsx`) — already generic.
- `tiktok-video-ranking-list.tsx`, `tiktok-trending-widget.tsx`, `tiktok-stats-summary.tsx`
  — these render from the generic `VideoTrendingResult`/`VideoSummary` shape, not
  anything TikTok-specific (no TikTok-only field is read). **Generalized in place**:
  renamed to `content-ranking-list.tsx`, `content-trending-widget.tsx`,
  `content-stats-summary.tsx` under `src/components/channels/shared/`, TikTok's
  dashboard updated to import from the new location (mechanical rename, not a
  behavior change — done as its own first task so it's easy to verify nothing broke
  before building new platform-specific code on top).

**NOT reusable — genuinely platform-specific, built fresh:**
- The video/post-list fetcher and its pagination shape (`fetchAllTiktokVideos` reads
  TikTok's `video/list`; Facebook/Instagram need their own paginated readers over
  `published_posts` / `media`).
- The snapshot table and sync wiring (new content, not video-shaped end to end —
  Facebook posts aren't all videos).
- The grid/card components (`tiktok-video-grid.tsx`/`tiktok-video-card.tsx` are
  9:16-locked per the TikTok spec's explicit reference-matching; Facebook/Instagram
  get their own square-biased versions per this spec).
- The channel header (TikTok's profile-style header is TikTok-specific; Facebook/
  Instagram keep the existing generic `PageHeader`, not built here — out of scope,
  see below).

## Data model

### New table: `content_metrics_daily`

One row per (connection, post, day) — same reasoning as `video_metrics_daily`
(TikTok's own API only exposes current-moment cumulative counters, Facebook/Instagram
are the same: no historical per-post report endpoint, so growth has to come from our
own daily diff). **Shared by both `facebook` and `instagram` providers** (unlike
`video_metrics_daily`, which is TikTok-only) — same OAuth family, same Graph API,
near-identical shape, no reason to duplicate the table. A `provider` column
disambiguates.

```sql
create table public.content_metrics_daily (
  connection_id      uuid not null references public.connections (id) on delete cascade,
  provider           text not null check (provider in ('facebook', 'instagram')),
  external_post_id   text not null,
  date               date not null,
  likes              bigint not null default 0,  -- reactions for facebook, likes for instagram
  comments           bigint not null default 0,
  shares             bigint not null default 0,  -- always 0 for instagram (Graph API doesn't expose it)
  message             text,                       -- post caption/text, truncated
  image_url          text,
  permalink          text,
  synced_at          timestamptz not null default now(),
  primary key (connection_id, external_post_id, date)
);

create index content_metrics_daily_connection_date_idx
  on public.content_metrics_daily (connection_id, date);
```

RLS: identical pattern to `video_metrics_daily` (select for site members via
`is_site_member`, no write policy, `service_role` only).

No `views` column: neither Facebook's Page-post node nor Instagram's Business media
object reliably expose a stable "impressions/views" count without `read_insights`
(currently dropped from the OAuth scope — see the connections-debugging thread earlier
today; Facebook posts don't have it on the post node at all, only via the `/insights`
edge). Ranking uses `likes + comments + shares` as the engagement score instead of
`views`, everywhere `views` would have been used for TikTok/YouTube. This is a real,
deliberate difference from the TikTok/YouTube pipelines, not an oversight — see
"Engagement score, not views" below.

### RPC: `get_content_trending_snapshots`

Same shape and same lesson-learned design as `get_video_trending_snapshots`
(`supabase/migrations/20260814000004_video_trending_snapshots_fn.sql` +
`20260814000005_video_trending_order_by.sql`) — **one row per post from the start**,
not the UNION-of-roles design that had to be corrected for TikTok. Adds a
`p_provider` argument to scope to one platform at a time (a connection's `facebook`
and `instagram` rows never need to be queried together — each channel-detail page is
one provider).

```sql
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
  earliest_score bigint,   -- likes+comments+shares at the earliest snapshot, precomputed in SQL
  cutoff0_date date,
  cutoff0_score bigint,
  cutoff1_date date,
  cutoff1_score bigint,
  cutoff2_date date,
  cutoff2_score bigint
)
```

(Precomputing the engagement score in SQL, rather than returning raw
likes/comments/shares for every role like the TikTok version does, is a small
deliberate simplification — TikTok's `views` was already a single number so no
score computation was needed; here we'd otherwise need 3 numbers × 5 roles = 15
columns instead of 8. Only `latest_*` needs the full breakdown, since that's what's
displayed; `earliest`/`cutoff*` only ever feed into a growth diff, so a
pre-summed score is sufficient and keeps the function narrower.)

`security invoker`, `set search_path = ''`, explicit `revoke`/`grant to authenticated`
— identical security posture to the TikTok RPC, for the identical reason (RLS on
`content_metrics_daily` already gates this correctly under invoker semantics).

### Sync

Two new paginated fetchers, mirroring `fetchAllTiktokVideos`'s shape:
- `fetchAllFacebookPosts(accessToken, pageId)` — paginates `{pageId}/published_posts`
  via Graph API's standard `paging.next` cursor (not TikTok's bespoke
  cursor/has_more — Facebook's pagination is the platform-standard cursor-based
  `after` token pattern already used nowhere else in this codebase yet, so this is
  a genuinely new pagination shape to implement, not a copy of TikTok's).
- `fetchAllInstagramMedia(accessToken, igUserId)` — same pagination pattern, against
  `{igUserId}/media`.

Both wired into `syncConnection` (`src/lib/sync/sync-connection.ts`) the same way
TikTok's snapshot sync is: `after()`-wrapped, non-blocking, only for the matching
provider, after the connection's status update — this repo already had to learn (and
fix, see `7b3ca94`/final-review history) that snapshot syncs must never block the
response or run before the status write; both new syncs are built with that lesson
already applied, not re-discovered.

Page count safety cap: same reasoning as TikTok's `MAX_VIDEO_LIST_PAGES`, same
non-advancing-cursor guard (also a lesson already paid for once on TikTok — applied
proactively here, not re-broken).

## Engagement score, not views

The TikTok/YouTube dashboards rank and grow-rate everything by `views`. Neither
Facebook nor Instagram exposes a comparable per-post metric without `read_insights`
(currently unavailable — see above). Ranking here uses **engagement score**
(`likes + comments + shares`, reactions counted as likes for Facebook) everywhere
`views` was the metric for TikTok. This changes the *meaning* of "top mọi thời gian"
and "tăng nhanh" for these two platforms (top-engagement, not top-viewed) but keeps
the exact same shape/UI pattern — `VideoSummary.views` is populated with the
engagement score for these two providers, so the ranking-list/trending-widget
components need no changes to consume it. Documented here so it isn't rediscovered
as a bug later: **`views` in the reused generic components means "the ranking
metric," not literally view count, for Facebook/Instagram.**

If `read_insights` gets sorted out later (real impressions data becomes available),
this is a data-layer-only follow-up — swap the score for real Facebook `page_impressions`
sums where available; the UI/RPC shape doesn't need to change.

## UI

### Grid (Tổng quan tab)

New components (NOT reusing `tiktok-video-grid.tsx`, which is 9:16-locked per its own
spec): `src/components/channels/shared/content-grid.tsx` +
`content-card.tsx`, shared by both Facebook and Instagram (identical card shape,
different data source) — `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`, each cell a
1:1 (square) image with:
- Engagement score overlay, bottom-left (same position/style as TikTok's view-count
  overlay, same formatting), reusing whatever the TikTok card's number-formatting
  helper is (check `tiktok-video-card.tsx` for the exact utility before writing a
  new one).
- Post date overlay, top-right — same as TikTok.
- Text-only Facebook posts (no `image_url`): render a solid-color placeholder tile
  with the post's `message` excerpt overlaid instead of a photo — Facebook Pages
  post text-only updates routinely, unlike TikTok/Instagram where every item has
  media; the grid must not silently drop these posts.
- Whole cell opens a detail dialog, same interaction pattern as TikTok's.

### Detail dialog

`content-detail-dialog.tsx` (shared) — image/placeholder, full message text, 3 stats
(likes/comments/shares — no "views" stat, unlike TikTok's 4-stat dialog, since there
is no separate view count here distinct from the engagement score already shown),
exact date, "Xem trên Facebook/Instagram" link from `permalink` (same idea as
TikTok's `share_url` link, platform-appropriate label).

### Dashboard tab

Reuses the generalized `content-ranking-list.tsx` / `content-trending-widget.tsx` /
`content-stats-summary.tsx` (see "reusable" list above) — same 4-widget layout as
TikTok's dashboard (today's engagement / all-time engagement / trending fast /
totals), same empty-state rules keyed off `earliestSnapshotAt`. New orchestrator
`content-dashboard.tsx` (parallel to `tiktok-dashboard.tsx`, not a fork of it —
thin enough that forcing one shared orchestrator component to branch on provider
would add more complexity than it removes).

### Wiring

`site-channel-detail.ts`'s `case 'facebook':` and `case 'instagram':` branches gain
a `trending: VideoTrendingResult` field (same pattern as the `tiktok`/`youtube`
cases), fetched in parallel with existing `data` via `Promise.all` (learned from the
final-review finding on the TikTok wiring — build it parallel from the start this
time, not sequential-then-fixed).

`ChannelDetailBody`'s switch gets two new tab-delegating branches (`facebook`,
`instagram`), following the exact same `UrlTabs` + two-panel pattern as `tiktok`.

### Explicitly out of scope

- A TikTok-profile-style header for Facebook/Instagram — the user's ask was about
  tabs/grid/dashboard, not the header; existing `PageHeader` stays. Revisit only if
  asked.
- Any change to `content_metrics_daily`'s data being real "views" — see "Engagement
  score, not views" above; this is a scoped, load-bearing design decision, not a
  placeholder.
- Re-enabling `read_insights` — separate, already-tracked follow-up from the earlier
  connection-debugging thread today.

## Trạng thái triển khai (data layer)

Xong, đã qua review độc lập (agent `code-reviewer`, model opus), commit vào
main. Khác vài chỗ so với thiết kế ban đầu ở trên, ghi lại để không ai đọc
nhầm bản cũ:

- Contract cuối cùng (chốt trực tiếp với phiên UI) đổi tên field so với
  `VideoSummary` — không tái dùng type đó, tạo `ContentSummary`/
  `ContentGrowthSummary`/`ContentTrendingResult` riêng
  (`src/lib/providers/content-trending-types.ts`), field `externalPostId`/
  `title`/`permalinkUrl`/`createdAt` thay vì `externalVideoId`/`views`/...
  `shares: number | null` (không phải `number`) — `null` cho Instagram.
- `thumbnailUrl`/`permalinkUrl` LÀ dữ liệu thật (`full_picture`/`media_url`,
  `permalink_url`/`permalink`), không phải `null` cứng như bản nháp đầu —
  Graph API trả kèm miễn phí trong cùng response, không lý do bỏ qua.
- Thêm `createdAt` (cột `posted_at`, thời điểm bài đăng THẬT được tạo, khác
  ngày snapshot) — bỏ sót ở thiết kế đầu, thêm bằng migration nối tiếp
  (`20260814000008`/`20260814000009`) sau khi đối chiếu lại contract.
- Trần phân trang fetch (`MAX_CONTENT_PAGES × PAGE_LIMIT` trong
  `meta-content.ts`) CỐ Ý giữ ở 1000 bài/connection — khớp trần thực tế của
  TikTok — để không bao giờ chạm `max_rows` mặc định (1000) của PostgREST khi
  RPC đọc lại, không phải một con số tuỳ ý.
- `paginateGraph` dừng khi trang rỗng (`data.length === 0`), KHÔNG dừng khi
  hết `paging.next` — cursor pagination của Graph API có thể tiếp tục trả
  `next` mới dù hết dữ liệu, khác cơ chế `cursor`/`has_more` của TikTok.
- Rủi ro đã biết, CHƯA xử lý (ngoài phạm vi task này, cùng nhóm "CHƯA ai chạy
  thử với app thật" như mọi adapter Meta khác trong repo): `/{page-id}/published_posts`
  và `/{ig-user-id}/media` có thể cần Page Access Token thay vì User token
  đang dùng (`resolveAccessToken` trả User token) — PARITY với
  `fetchFacebookContentExplore`/`facebookMetricsAdapter` đã shipped trước đó,
  không phải lỗi mới của task này. Nếu đúng vậy, hệ quả là snapshot rỗng vĩnh
  viễn, không lỗi rõ ràng nào để nhận biết — cần xác minh khi có kết nối Meta
  thật đầu tiên chạy qua `syncConnection`.
