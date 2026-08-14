# Video metrics snapshot pipeline (TikTok + YouTube trending/top-all-time)

## Problem

The TikTok and YouTube channel-detail pages want two features:
- **"Video tăng nhanh"** — videos gaining views/engagement fastest recently.
- **"Top video mọi thời gian"** — highest all-time performers.

Today, `fetchTiktokContentExplore` (`src/lib/providers/tiktok.ts`) and
`fetchYoutubeExplore` (`src/lib/providers/google-explore.ts`) fetch video stats
live on every page load with no history stored. That's enough for "what does
this video look like right now" but not for "how fast is it growing," which
requires comparing two points in time.

## Key constraint driving the design

TikTok's Display API (`video/list`) returns **cumulative, current-moment**
counters (view_count, like_count, ...) with no historical/dated report
endpoint — the only way to know growth is to snapshot these counters
ourselves and diff between two snapshots.

YouTube Analytics API is the opposite: it already accepts arbitrary
`startDate`/`endDate` and returns per-video metrics for that window on
demand — no storage needed to answer "how much did this grow in the last N
days," it's just two API calls with different date ranges.

Decision (confirmed with user): **only TikTok gets a stored daily snapshot.
YouTube keeps calling Analytics API directly**, no new storage. Both are
still exposed to the UI through one shared shape (below) so the TikTok and
YouTube channel-detail pages can share rendering logic despite pulling from
different sources underneath.

## Schema

New table, TikTok-only for now (generic enough to extend to other
snapshot-model platforms later, e.g. Instagram):

```sql
create table public.video_metrics_daily (
  connection_id      uuid not null references public.connections(id) on delete cascade,
  external_video_id  text not null,
  date               date not null,
  views              bigint not null default 0,
  likes              bigint not null default 0,
  comments           bigint not null default 0,
  shares             bigint not null default 0,
  title              text,
  cover_image_url    text,
  synced_at          timestamptz not null default now(),
  primary key (connection_id, external_video_id, date)
);

create index video_metrics_daily_connection_date_idx
  on public.video_metrics_daily (connection_id, date);
```

RLS: same pattern as `metrics_daily` — site members can `select` (via
`is_site_member` through the parent `connections` row), only `service_role`
writes. No retention/pruning job: at most a few hundred rows/connection/year,
not worth the complexity.

## Sync

Extends the existing daily cron (`/api/cron/sync-all`, `0 20 * * *`,
Vercel Hobby plan — no new cron job). Inside `syncConnection` for provider
`tiktok`, after the existing channel-level `metrics_daily` write
(`tiktokMetricsAdapter`), add a step that:

1. Calls `video/list` paginating via `cursor`/`has_more` (TikTok supports
   this; current `fetchTiktokContentExplore` only reads one page of 20 and
   is unrelated/unchanged — it stays as the live "what's on the page right
   now" fetch for the Explore tab).
2. Upserts one `video_metrics_daily` row per video for today's date.
3. On API failure, skip the write and leave prior days' rows intact (same
   graceful-degradation posture as other snapshot adapters) — doesn't fail
   the whole `syncConnection` call, channel-level metrics still sync.

## Read layer — shared shape for TikTok and YouTube

Revised after design review with the TikTok channel-detail UI session: rank
by **growth rate (%), not absolute delta** — the goal is surfacing videos
that are newly "hot," not videos that already have the most views (those
are already covered by `topAllTime`). A tiny video going from 2 to 20 views
is a 900% jump that means nothing, so a minimum-view floor guards the
denominator. The UI also wants week/month/year as fixed, independent
windows for this card — not tied to the page's date-range picker (that
picker still governs everything else on the page, just not this card).

```ts
interface VideoSummary {
  externalVideoId: string
  title: string
  thumbnailUrl: string | null
  views: number
  likes: number
  comments: number
  shares: number | null
}

interface VideoGrowthSummary extends VideoSummary {
  growthDelta: number       // views gained over the window (absolute)
  growthPct: number | null  // null if starting views was 0; this is the default sort key
}

interface VideoTrendingResult {
  topAllTime: readonly VideoSummary[]
  trendingFast: {
    week: readonly VideoGrowthSummary[]
    month: readonly VideoGrowthSummary[]
    year: readonly VideoGrowthSummary[]
  }
}
```

`topAllTime` needs no date parameter — it's the latest known snapshot per
video, sorted by views desc, full stop. `trendingFast` computes three fixed
windows every call (week = 7 days, month = 30 days, year = 365 days) so the
UI can toggle between them client-side with no extra round trip. Both
`getTiktokVideoTrending` and `getYoutubeVideoTrending` therefore drop the
`range` parameter entirely — neither function takes a date argument anymore.

For each window, growth = views at the end of the window minus views at the
start of the window (start = the window's length before today), both
compared against a **minimum-view floor of 50** on the starting value — a
video with fewer than 50 views at the start of the window is excluded from
that window's `trendingFast` list (its % would be noise-dominated). Sort
each window's list by `growthPct` desc.

- `getTiktokVideoTrending(connectionId)` — reads all of
  `video_metrics_daily` for the connection once, then computes `topAllTime`
  and all three `trendingFast` windows from that one result set in memory
  (cheap: at most a few hundred rows). For a window whose start-of-window
  snapshot doesn't exist yet (new connection, less history than the window
  needs), fall back to the earliest available snapshot as the baseline —
  "growth since we started tracking," which under-counts true growth but
  degrades gracefully instead of returning nothing.
- `getYoutubeVideoTrending(accessToken, channelId)` — two Analytics API
  calls total (not one per window, to keep quota/latency bounded):
  1. One report with `dimensions=video,day` over the last 366 days,
     `metrics=views` only, to get each video's daily view series. Window
     deltas are computed by summing the appropriate day-buckets from this
     single series — this is what keeps the call count at 2 instead of 6+.
  2. One report with `dimensions=video` (no day breakdown) over a fixed
     10-year lookback, all four metrics (views/likes/comments/shares), for
     `topAllTime` and to attach current likes/comments/shares onto each
     `trendingFast` entry (the daily-views series only has views).

Both return the same `VideoTrendingResult` shape so the UI renders one
component regardless of platform, even though the data scope/pagination/
API-call strategy underneath differs per the real capabilities of each
platform's API.

## Defaults (adjustable later without schema/interface changes)

- Trending windows: fixed week (7d) / month (30d) / year (365d), computed
  every call rather than chosen by a caller-supplied parameter.
- Minimum-view floor: 50 views at the start of the window, to keep
  `growthPct` from being dominated by near-zero-denominator noise.
- No minimum-snapshot-count edge case beyond "need 2 data points to diff" —
  a video seen for the first time (or a window with no baseline snapshot at
  all) just doesn't appear in that window's `trendingFast` list yet.

## Out of scope / explicitly not doing

- No new cron job (Vercel Hobby plan constraint, confirmed with user).
- No retention/pruning.
- No YouTube snapshot storage.
- No changes to the existing live "Explore" tab fetchers
  (`fetchTiktokContentExplore`, `fetchYoutubeExplore`) — this pipeline is
  additive, for the new trending/top-all-time features specifically.
