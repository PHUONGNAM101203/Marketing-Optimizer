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
  growthDelta: number   // views gained over the window
  growthPct: number | null // null if starting views was 0
}

interface VideoTrendingResult {
  topAllTime: readonly VideoSummary[]
  trendingFast: readonly VideoGrowthSummary[]
}
```

Growth window = the page's already-selected date range (`{ startDate, endDate }`,
same `range` object every other Explore fetcher already takes), not a
separate hardcoded window — one less parameter, and it matches how every
other metric on the page already respects the topbar date picker.

- `getTiktokVideoTrending(connectionId, range)` — reads
  `video_metrics_daily`. `topAllTime` = latest snapshot per video (regardless
  of range), sorted by views desc. `trendingFast` = for each video, views at
  the snapshot closest to `range.endDate` minus views at the snapshot
  closest to (but not after) `range.startDate`; videos with fewer than 2
  snapshots in range are excluded (nothing to diff yet).
- `getYoutubeVideoTrending(accessToken, channelId, range)` — calls YouTube
  Analytics API twice (once for `range`, once for the equal-length window
  immediately preceding it) and computes the same delta/pct shape;
  `topAllTime` uses one wide-range call (a fixed 10-year lookback — YouTube
  Analytics returns zero rows for a channel younger than that, which is
  harmless).

Both return the same `VideoTrendingResult` shape so the UI (owned by the
TikTok channel-detail design session) renders one component regardless of
platform, even though the data scope/pagination behavior underneath differs
per the real capabilities of each platform's API.

## Defaults (adjustable later without schema changes)

- Trending window: 7 days (less noisy than 24h, and new connections have
  enough history within a week).
- No minimum-snapshot-count edge case beyond "need 2 data points" — a video
  seen for the first time just doesn't appear in `trendingFast` yet.

## Out of scope / explicitly not doing

- No new cron job (Vercel Hobby plan constraint, confirmed with user).
- No retention/pruning.
- No YouTube snapshot storage.
- No changes to the existing live "Explore" tab fetchers
  (`fetchTiktokContentExplore`, `fetchYoutubeExplore`) — this pipeline is
  additive, for the new trending/top-all-time features specifically.
