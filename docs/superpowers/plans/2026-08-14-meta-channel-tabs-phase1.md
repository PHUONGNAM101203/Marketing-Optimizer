# Facebook/Instagram Channel Tabs (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Facebook and Instagram channel-detail pages the same "Tổng quan / Dashboard" tab treatment TikTok already has in production — a profile-style header, a ranked post list with a click-through detail dialog, and two Dashboard widgets that need no new backend work. (Two more Dashboard widgets — top-all-time, trending-fast — are Phase 2, blocked on a sibling session's data-layer work and explicitly not part of this plan.)

**Architecture:** One provider-adapter file gets three new fields added to an existing, already-shipped response shape (same additive pattern TikTok's Task 1 used). Four new small components are shared across BOTH Facebook and Instagram — not duplicated per platform — by taking pre-computed, platform-neutral props (a `metrics: {icon,label,value}[]` array, a `stats: {label,value}[]` array) rather than knowing platform-specific field names themselves; the one place that DOES know Facebook from Instagram is `channel-detail-body.tsx`'s existing per-provider `switch`, which already has a `case` per platform and does the field-name mapping inline, matching how every other provider case in that file already works.

**Tech Stack:** Next.js 16 App Router (Server Components), TypeScript, Tailwind v4 / Hallmark design tokens, Radix UI Dialog (already in the codebase, not new), `lucide-react`.

## Global Constraints

- **No test framework configured.** Verification is `npx tsc --noEmit` (zero errors) + `npm run lint` (zero new errors) for every task; `npm run build` + a dev-server check for the final task. Do not add tests.
- **Hallmark token discipline:** no raw hex/oklch colors outside `tokens.css`; every new component file starts with `/* Hallmark · component: <kebab-case-name> · theme: studied-DNA (Ink & Signal) */`; CSS-var font-size classes must use `text-[length:var(--text-sm)]`, never the bare form (see `src/lib/cn.ts`'s docblock).
- **Every user-facing number goes through `src/lib/format.ts`** (`formatNumber`, `formatCompact`, `formatDate`, `formatDateTime`) — never a raw number or `.toLocaleString()`.
- **Comments are Vietnamese, non-obvious *why* only** — matching the surrounding codebase.
- **Immutability:** no mutation of props/params; build new arrays/objects.
- **No dense image grid** — this is a deliberate, spec-level decision (`docs/superpowers/specs/2026-08-14-meta-channel-tabs-design.md`): Facebook/Instagram posts have no "view count" and, until this plan's Task 1, no thumbnail either. A ranked list, not TikTok's grid, is correct here — do not "improve" this into a grid.
- **Do not touch any file under `src/components/channels/tiktok/`** or `src/components/ui/tabs.tsx` — those are already shipped, already reviewed, already in production for an unrelated platform. This plan creates new, small, standalone components even where they end up structurally similar to TikTok's (documented, deliberate duplication — see the spec's "Deliberate non-reuse" notes).
- **Do not touch `src/lib/data/site-channel-detail.ts`** — Phase 2 (not this plan) is what adds a `trending` field to the `facebook`/`instagram` `ChannelDetail` variants; this plan only changes what's inside the existing `data` field's shape.

---

### Task 1: Extend `meta-explore.ts` with `createdAt`, `permalinkUrl`, `thumbnailUrl`, `fetchError`

**Files:**
- Modify: `src/lib/providers/meta-explore.ts` (full file, 124 lines)

**Interfaces:**
- Consumes: nothing new — extends the existing `fetchInstagramExplore`/`fetchFacebookContentExplore` return shapes.
- Produces: `InstagramExplore.topPosts[number]` and `FacebookExplore.topPosts[number]` each gain `createdAt: string | null`, `permalinkUrl: string | null`, `thumbnailUrl: string | null`; both `InstagramExplore`/`FacebookExplore` gain a top-level `fetchError: string | null`. Tasks 2 and 5 depend on all of these.

Both functions currently request a timestamp field (`timestamp`/`created_time`) but discard it, request no permalink or media field at all, truncate the caption/message to 80 characters (no longer wanted — the new detail dialog needs the full text and nothing else depends on the cap, confirmed: the current `BreakdownSection` usage this plan removes was the only consumer, and it truncates for DISPLAY via CSS, not by needing a short string), and silently swallow fetch failures into an empty list indistinguishable from "no posts."

- [ ] **Step 1: Rewrite `InstagramExplore` and `fetchInstagramExplore`**

Replace lines 12-61 of `src/lib/providers/meta-explore.ts`:

```typescript
export interface InstagramExplore {
  readonly topPosts: readonly {
    readonly caption: string
    readonly likes: number
    readonly comments: number
    /** ISO 8601 — Instagram's `timestamp` field is already this format, no
     * conversion needed (unlike TikTok's Unix-seconds `create_time`). */
    readonly createdAt: string | null
    readonly permalinkUrl: string | null
    /** Ảnh bài đăng — Graph trả field này MIỄN PHÍ trong cùng response đang
     * gọi, không tốn thêm request. Dùng cho thumbnail nhỏ trong danh sách,
     * KHÔNG đổi quyết định dùng danh sách thay vì lưới ảnh (xem spec). */
    readonly thumbnailUrl: string | null
  }[]
  /** `null` = tải thành công (danh sách có thể rỗng — bình thường). Khác
   * `null` = request thất bại thật, kèm lý do — không được lẫn với "chưa có
   * bài đăng nào", cùng quy ước với `TiktokExplore.fetchError`. */
  readonly fetchError: string | null
}

interface InstagramMediaItem {
  readonly id?: string
  readonly caption?: string
  readonly like_count?: number
  readonly comments_count?: number
  readonly timestamp?: string
  readonly permalink?: string
  readonly media_url?: string
}

/** `since`/`until` là mốc NGÀY (YYYY-MM-DD), Graph API tự hiểu — cùng cách
 * lọc theo khoảng ngày với GA4/GSC/YouTube ở trên, để bảng xếp hạng cũng đổi
 * theo bộ lọc ngày ở đầu trang thay vì luôn cố định "25 bài gần nhất". Không
 * có `shares` — Instagram Graph API không trả số lượt chia sẻ cho bài đăng
 * qua field cơ bản này (khác Facebook Page ở dưới). */
export const fetchInstagramExplore = async (
  accessToken: string,
  externalAccountId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<InstagramExplore> => {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}/media`)
  url.searchParams.set('fields', 'caption,like_count,comments_count,timestamp,permalink,media_url')
  url.searchParams.set('since', range.startDate)
  url.searchParams.set('until', range.endDate)
  url.searchParams.set('limit', '25')

  const response = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    return { topPosts: [], fetchError: `Instagram trả lỗi HTTP ${response.status}` }
  }

  const data = (await response.json()) as { data?: readonly InstagramMediaItem[] }

  const topPosts = (data.data ?? [])
    .map((item) => ({
      caption: item.caption ?? '(không có chú thích)',
      likes: item.like_count ?? 0,
      comments: item.comments_count ?? 0,
      createdAt: item.timestamp ?? null,
      permalinkUrl: item.permalink ?? null,
      thumbnailUrl: item.media_url ?? null,
    }))
    .sort((a, b) => b.likes + b.comments - (a.likes + a.comments))
    .slice(0, 10)

  return { topPosts, fetchError: null }
}
```

- [ ] **Step 2: Rewrite `FacebookExplore` and `fetchFacebookContentExplore`**

Replace lines 63-123 (the rest of the file):

```typescript
/**
 * Số liệu chi tiết cho trang chi tiết kênh Facebook (nội dung hữu cơ Page —
 * KHÁC `meta-ads`). Đọc like/comment/share thẳng từ NODE của post
 * (`reactions.summary`/`comments.summary`/`shares`) thay vì cạnh `insights`
 * — theo nghiên cứu 2026, nhiều metric `post_impressions*` đã bị Meta khai
 * tử (2025), field trên node bài viết ổn định hơn qua các đợt đổi đó.
 */
export interface FacebookExplore {
  readonly topPosts: readonly {
    readonly message: string
    readonly reactions: number
    readonly comments: number
    readonly shares: number
    /** ISO 8601 — Facebook's `created_time` là format chuẩn Graph API, không
     * cần đổi đơn vị (khác TikTok's Unix-seconds `create_time`). */
    readonly createdAt: string | null
    readonly permalinkUrl: string | null
    /** Ảnh bài đăng — `full_picture` trả MIỄN PHÍ trong cùng response, xem
     * ghi chú tương ứng ở `InstagramExplore` phía trên. */
    readonly thumbnailUrl: string | null
  }[]
  /** Cùng quy ước với `InstagramExplore.fetchError` — xem ghi chú ở đó. */
  readonly fetchError: string | null
}

interface FacebookPostItem {
  readonly id?: string
  readonly message?: string
  readonly created_time?: string
  readonly reactions?: { readonly summary?: { readonly total_count?: number } }
  readonly comments?: { readonly summary?: { readonly total_count?: number } }
  readonly shares?: { readonly count?: number }
  readonly permalink_url?: string
  readonly full_picture?: string
}

/** `since`/`until` cùng cơ chế Instagram ở trên — lọc theo `created_time`
 * của bài viết, để bảng xếp hạng đổi theo bộ lọc ngày ở đầu trang. */
export const fetchFacebookContentExplore = async (
  accessToken: string,
  pageId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<FacebookExplore> => {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/published_posts`)
  url.searchParams.set(
    'fields',
    'message,created_time,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares,permalink_url,full_picture',
  )
  url.searchParams.set('since', range.startDate)
  url.searchParams.set('until', range.endDate)
  url.searchParams.set('limit', '25')

  const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${accessToken}` } })
  if (!response.ok) {
    return { topPosts: [], fetchError: `Facebook trả lỗi HTTP ${response.status}` }
  }

  const data = (await response.json()) as { data?: readonly FacebookPostItem[] }

  const topPosts = (data.data ?? [])
    .map((item) => ({
      message: item.message ?? '(không có nội dung)',
      reactions: item.reactions?.summary?.total_count ?? 0,
      comments: item.comments?.summary?.total_count ?? 0,
      shares: item.shares?.count ?? 0,
      createdAt: item.created_time ?? null,
      permalinkUrl: item.permalink_url ?? null,
      thumbnailUrl: item.full_picture ?? null,
    }))
    .sort(
      (a, b) =>
        b.reactions + b.comments + b.shares - (a.reactions + a.comments + a.shares),
    )
    .slice(0, 10)

  return { topPosts, fetchError: null }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS with zero errors. This change is purely additive (new fields on an existing shape, same function signatures) — the only current consumer, `channel-detail-body.tsx`'s `case 'instagram':`/`case 'facebook':`, reads only the pre-existing fields (`row.caption`/`row.likes`/etc.), so it's unaffected until Task 5 changes it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/providers/meta-explore.ts
git commit -m "feat: add createdAt, permalinkUrl, thumbnailUrl, fetchError to Meta explore data"
```

---

### Task 2: Build `MetaPostList` + `MetaPostDetailDialog`

**Files:**
- Create: `src/components/channels/meta/meta-post-list.tsx`
- Create: `src/components/channels/meta/meta-post-detail-dialog.tsx`

**Interfaces:**
- Consumes: `DialogRoot`/`DialogTrigger`/`DialogContent` from `src/components/ui/dialog.tsx`, `Card` from `src/components/ui/card.tsx`, `Callout`/`EmptyState` from `src/components/ui/feedback.tsx`, `Button` from `src/components/ui/button.tsx`, `formatCompact`/`formatDate`/`formatDateTime` from `src/lib/format.ts`.
- Produces: `export interface MetaPostItem { title, thumbnailUrl, createdAt, permalinkUrl, metrics: readonly {icon, label, value}[] }` and `MetaPostList({ posts, fetchError, emptyDescription })`. Task 5 depends on this exact shape — it's the mapping target `channel-detail-body.tsx` builds from raw `InstagramExplore`/`FacebookExplore` rows.

This is the platform-neutral shared component both the Overview tab and Dashboard widget 1 use for both Facebook and Instagram — it has no knowledge of which platform it's rendering, only a pre-shaped list of posts with a generic `metrics` array (2 entries for Instagram: likes, comments; 3 for Facebook: reactions, comments, shares) that `channel-detail-body.tsx` builds per-provider (Task 5).

- [ ] **Step 1: Write `meta-post-list.tsx`**

```typescript
import { AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { MetaPostDetailDialog } from './meta-post-detail-dialog'
import { formatCompact, formatDate } from '@/lib/format'
import type { Eye } from 'lucide-react'

export interface MetaPostMetric {
  readonly icon: typeof Eye
  readonly label: string
  readonly value: number
}

export interface MetaPostItem {
  readonly title: string
  readonly thumbnailUrl: string | null
  readonly createdAt: string | null
  readonly permalinkUrl: string | null
  readonly metrics: readonly MetaPostMetric[]
}

/* Hallmark · component: meta-post-list · theme: studied-DNA (Ink & Signal)
 *
 * Dùng chung cho Facebook và Instagram, cả tab Tổng quan lẫn widget xếp
 * hạng ở Dashboard — component không biết gì về nền tảng, chỉ nhận sẵn
 * `metrics` (2 mục cho Instagram, 3 cho Facebook) đã được chuẩn bị ở nơi
 * gọi (channel-detail-body.tsx), giống cách `TiktokVideoRankingList` tách
 * dữ liệu khỏi hình dạng hiển thị — không phải component TikTok, cố tình
 * không tái dùng để không đụng file đã lên production (xem spec).
 */
export function MetaPostList({
  posts,
  fetchError,
  emptyDescription,
}: {
  readonly posts: readonly MetaPostItem[]
  readonly fetchError: string | null
  readonly emptyDescription: string
}) {
  if (fetchError) {
    return (
      <Callout
        tone="critical"
        icon={<AlertTriangle aria-hidden className="size-5 text-[var(--color-negative)]" />}
        title="Không lấy được danh sách bài đăng"
      >
        <p>{fetchError}</p>
      </Callout>
    )
  }

  if (posts.length === 0) {
    return <EmptyState title="Chưa có bài đăng" description={emptyDescription} />
  }

  return (
    <Card className="flex flex-col divide-y divide-[var(--color-rule)] overflow-hidden p-0">
      {posts.map((post, index) => (
        <DialogRoot key={index}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-[var(--color-paper-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              <span
                data-numeric
                className="w-5 shrink-0 text-[length:var(--text-sm)] font-semibold text-[var(--color-ink-3)]"
              >
                {index + 1}
              </span>
              {post.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.thumbnailUrl}
                  alt=""
                  className="size-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
                />
              ) : (
                <div className="size-10 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-paper-3)]" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[length:var(--text-sm)] text-[var(--color-ink)]"
                  title={post.title}
                >
                  {post.title}
                </p>
                {post.createdAt ? (
                  <p className="mt-0.5 text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
                    {formatDate(post.createdAt.slice(0, 10))}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {post.metrics.map((metric, metricIndex) => (
                  <span
                    key={metricIndex}
                    data-numeric
                    className="flex items-center gap-1 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]"
                  >
                    <metric.icon aria-hidden className="size-3.5 text-[var(--color-ink-3)]" />
                    {formatCompact(metric.value)}
                  </span>
                ))}
              </div>
            </button>
          </DialogTrigger>

          <MetaPostDetailDialog post={post} />
        </DialogRoot>
      ))}
    </Card>
  )
}
```

- [ ] **Step 2: Write `meta-post-detail-dialog.tsx`**

```typescript
import { ExternalLink } from 'lucide-react'
import { DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatCompact, formatDateTime } from '@/lib/format'
import type { MetaPostItem } from './meta-post-list'

/* Hallmark · component: meta-post-detail-dialog · theme: studied-DNA (Ink & Signal) */
export function MetaPostDetailDialog({ post }: { readonly post: MetaPostItem }) {
  return (
    <DialogContent
      title={post.title}
      description={
        post.createdAt
          ? formatDateTime(post.createdAt, {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {post.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnailUrl}
            alt=""
            className="max-h-80 w-full rounded-[var(--radius-md)] object-cover"
          />
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          {post.metrics.map((metric, index) => (
            <DetailStat
              key={index}
              icon={metric.icon}
              label={metric.label}
              value={formatCompact(metric.value)}
            />
          ))}
        </div>

        {post.permalinkUrl ? (
          <Button asChild variant="secondary" size="md">
            <a href={post.permalinkUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden className="size-4" />
              Xem bài đăng gốc
            </a>
          </Button>
        ) : null}
      </div>
    </DialogContent>
  )
}

function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  readonly icon: MetaPostItem['metrics'][number]['icon']
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-rule)] px-3 py-2.5">
      <Icon aria-hidden className="size-4 shrink-0 text-[var(--color-ink-3)]" />
      <div className="min-w-0">
        <p data-numeric className="text-[length:var(--text-lg)] font-semibold text-[var(--color-ink)]">
          {value}
        </p>
        <p className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">{label}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS with zero errors. (No consumers exist yet — Task 5 wires this in — so this only proves the two files compile and type-check against each other.)

- [ ] **Step 4: Commit**

```bash
git add src/components/channels/meta/meta-post-list.tsx src/components/channels/meta/meta-post-detail-dialog.tsx
git commit -m "feat: add shared Facebook/Instagram post list and detail dialog"
```

---

### Task 3: Build `MetaChannelHeader` and wire it into the channel page

**Files:**
- Create: `src/components/channels/meta/meta-channel-header.tsx`
- Modify: `src/app/(app)/[siteId]/channels/[provider]/page.tsx`

**Interfaces:**
- Consumes: `ChannelDetail` from `src/lib/data/site-channel-detail.ts`, `ChannelDailyPoint` from `src/lib/data/site-channels.ts`, `ChannelAvatar`, `ExternalChannelLink`, `Badge`, `formatNumber`.
- Produces: `MetaChannelHeader({ siteId, detail, dailySeries, connected, dateRangeLabel })` where `detail: Extract<ChannelDetail, {kind: 'facebook'|'instagram'}>`.

- [ ] **Step 1: Write `meta-channel-header.tsx`**

```typescript
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ChannelAvatar } from '@/components/channels/channel-avatar'
import { ExternalChannelLink } from '@/components/connections/external-channel-link'
import { Badge } from '@/components/ui/badge'
import type { ChannelDetail } from '@/lib/data/site-channel-detail'
import type { ChannelDailyPoint } from '@/lib/data/site-channels'
import { formatNumber } from '@/lib/format'

/* Hallmark · component: meta-channel-header · theme: studied-DNA (Ink & Signal)
 *
 * Dùng chung cho Facebook và Instagram — cùng bố cục với
 * `TiktokChannelHeader` (avatar lớn + tên + 3 số liệu cùng hàng) nhưng KHÔNG
 * tái dùng file đó (xem spec: tránh đụng code TikTok đã lên production).
 * 3 số liệu header lấy từ field ĐÃ được fetch bởi
 * instagramMetricsAdapter/facebookMetricsAdapter nhưng trước giờ chưa hiện
 * ở đâu cả (`reach`/`impressions`/`profileViews` cho Instagram,
 * `impressions`/`engagedUsers`/`postEngagements` cho Facebook) — không cần
 * đổi gì ở adapter.
 */
export function MetaChannelHeader({
  siteId,
  detail,
  dailySeries,
  connected,
  dateRangeLabel,
}: {
  readonly siteId: string
  readonly detail: Extract<ChannelDetail, { readonly kind: 'facebook' | 'instagram' }>
  readonly dailySeries: readonly ChannelDailyPoint[]
  readonly connected: boolean
  readonly dateRangeLabel: string
}) {
  const latest = dailySeries.length > 0 ? dailySeries[dailySeries.length - 1] : null
  const latestExtra = latest?.extra ?? {}

  const stats =
    detail.kind === 'instagram'
      ? [
          { label: 'Reach', value: Number(latestExtra.reach ?? 0) },
          { label: 'Lượt hiển thị', value: Number(latestExtra.impressions ?? 0) },
          { label: 'Lượt xem trang cá nhân', value: Number(latestExtra.profileViews ?? 0) },
        ]
      : [
          { label: 'Lượt hiển thị', value: Number(latestExtra.impressions ?? 0) },
          { label: 'Người dùng tương tác', value: Number(latestExtra.engagedUsers ?? 0) },
          { label: 'Lượt tương tác bài đăng', value: Number(latestExtra.postEngagements ?? 0) },
        ]

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/${siteId}/channels`}
        className="inline-flex w-fit items-center gap-1 rounded-[var(--radius-sm)] text-[length:var(--text-sm)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Tất cả kênh
      </Link>

      <div className="flex flex-wrap items-start gap-5">
        <ChannelAvatar
          avatarUrl={detail.avatarUrl}
          provider={detail.kind}
          size="lg"
          className="size-20 sm:size-24"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 truncate text-[length:var(--text-display)] leading-[var(--leading-tight)] font-bold tracking-[var(--tracking-tight)] text-[var(--color-ink)]">
              {detail.accountName}
            </h1>
            {connected ? <Badge tone="positive">Đã kết nối</Badge> : null}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {stats.map((stat) => (
              <HeaderStat key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>

          <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">{dateRangeLabel}</p>
        </div>

        <ExternalChannelLink
          provider={detail.kind}
          externalAccountId={detail.externalAccountId}
          variant="secondary"
          size="md"
        />
      </div>
    </div>
  )
}

function HeaderStat({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span data-numeric className="text-[length:var(--text-base)] font-semibold text-[var(--color-ink)]">
        {formatNumber(value)}
      </span>
      <span className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">{label}</span>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the channel page**

In `src/app/(app)/[siteId]/channels/[provider]/page.tsx`, add the import:

```typescript
import { MetaChannelHeader } from '@/components/channels/meta/meta-channel-header'
```

Change the existing header ternary (currently `{provider === 'tiktok' && detail && detail.kind === 'tiktok' ? (<TiktokChannelHeader .../>) : (<div>...</div>)}`) into a 3-way ternary by inserting a new branch between the TikTok branch and the fallback `<div>`:

```typescript
      {provider === 'tiktok' && detail && detail.kind === 'tiktok' ? (
        <TiktokChannelHeader
          siteId={site.id}
          detail={detail}
          dailySeries={dailySeries}
          connected={summary?.connected ?? false}
          dateRangeLabel={formatDateRange(range.start, range.end)}
        />
      ) : (provider === 'facebook' || provider === 'instagram') &&
        detail &&
        (detail.kind === 'facebook' || detail.kind === 'instagram') ? (
        <MetaChannelHeader
          siteId={site.id}
          detail={detail}
          dailySeries={dailySeries}
          connected={summary?.connected ?? false}
          dateRangeLabel={formatDateRange(range.start, range.end)}
        />
      ) : (
        <div>
          {/* ...unchanged fallback block, same as before... */}
        </div>
      )}
```

Do not touch the fallback `<div>...</div>` block's contents — copy it verbatim from the file's current state.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. If `detail` doesn't narrow inside the new branch, confirm the condition is written as a single inline expression in the JSX (same requirement as the TikTok branch before it) — not split into an intermediate `const`.

- [ ] **Step 4: Commit**

```bash
git add src/components/channels/meta/meta-channel-header.tsx "src/app/(app)/[siteId]/channels/[provider]/page.tsx"
git commit -m "feat: add shared Facebook/Instagram profile-style channel header"
```

---

### Task 4: Build `MetaStatsSummary`

**Files:**
- Create: `src/components/channels/meta/meta-stats-summary.tsx`

**Interfaces:**
- Consumes: `Card` from `src/components/ui/card.tsx`, `formatNumber` from `src/lib/format.ts`.
- Produces: `MetaStatsSummary({ stats })` where `stats: readonly { label: string; value: number }[]` (2 items for Instagram, 3 for Facebook — the caller in Task 5 decides). Renders a `grid-cols-2` or `grid-cols-3` layout depending on `stats.length`.

Same reasoning as `TiktokStatsSummary` for not using `StatTile`: these are raw engagement totals, not a `MetricKey` from the ads/analytics metric system.

- [ ] **Step 1: Write the component**

```typescript
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'

/* Hallmark · component: meta-stats-summary · theme: studied-DNA (Ink & Signal)
 *
 * Nhận sẵn `stats` đã tính tổng ở nơi gọi — component không biết gì về
 * Facebook/Instagram, số lượng thẻ khác nhau (2 cho Instagram, 3 cho
 * Facebook) nên grid tự đổi cột theo `stats.length` thay vì cố định.
 */
export function MetaStatsSummary({
  stats,
}: {
  readonly stats: readonly { readonly label: string; readonly value: number }[]
}) {
  return (
    <div className={cn('grid gap-3', stats.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {stats.map((stat) => (
        <SummaryTile key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </div>
  )
}

function SummaryTile({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
        {label}
      </p>
      <p
        data-numeric
        className="text-[length:var(--text-2xl)] leading-[var(--leading-tight)] font-semibold tracking-[var(--tracking-tight)] text-[var(--color-ink)]"
      >
        {formatNumber(value)}
      </p>
    </Card>
  )
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/channels/meta/meta-stats-summary.tsx
git commit -m "feat: add Facebook/Instagram aggregate engagement stats widget"
```

---

### Task 5: Wire tabs into `ChannelDetailBody`'s Facebook and Instagram cases

**Files:**
- Modify: `src/components/channels/channel-detail-body.tsx` (currently: `case 'instagram':` at line 235, `case 'facebook':` at line 259 — see exact current text below)

**Interfaces:**
- Consumes: `UrlTabs` (already imported in this file for the TikTok case — reuse the same import), `MetaPostList`/`MetaPostItem` (Task 2), `MetaStatsSummary` (Task 4), `DATE_RANGE_LABELS` (already imported in this file for the TikTok case — reuse).
- Produces: the finished `case 'instagram':`/`case 'facebook':` branches — no further tasks depend on this file's shape.

- [ ] **Step 1: Add imports**

Add these two imports alongside the existing TikTok-related imports near the top of `src/components/channels/channel-detail-body.tsx` (do not duplicate `UrlTabs`/`DATE_RANGE_LABELS`, which are already imported there for the TikTok case):

```typescript
import { MetaPostList, type MetaPostItem } from '@/components/channels/meta/meta-post-list'
import { MetaStatsSummary } from '@/components/channels/meta/meta-stats-summary'
```

Also add `Heart, MessageCircle, Share2` to the existing `lucide-react` import at the top of the file if they aren't already imported (check first — `Heart`/`MessageCircle`/`Share2` may already be imported for other purposes in this file; if so, don't re-import, just reuse).

- [ ] **Step 2: Replace `case 'instagram':`**

Current content (lines 235-257):

```typescript
    case 'instagram':
      return (
        <div className="flex flex-col gap-6">
          <TrendCard
            title="Reach theo ngày"
            data={dailySeries.map((point) => ({
              date: point.date,
              reach: point.extra.reach ?? 0,
            }))}
            metricKey="reach"
            label="Reach"
          />
          <BreakdownSection
            label="Bài đăng"
            title="Bài đăng có tương tác cao nhất"
            rows={detail.data.topPosts.map((row) => ({
              dimension: row.caption,
              cells: [formatCompact(row.likes), formatCompact(row.comments)],
            }))}
            columns={['Lượt thích', 'Bình luận']}
          />
        </div>
      )
```

Replace with:

```typescript
    case 'instagram': {
      const igPosts: readonly MetaPostItem[] = detail.data.topPosts.map((row) => ({
        title: row.caption,
        thumbnailUrl: row.thumbnailUrl,
        createdAt: row.createdAt,
        permalinkUrl: row.permalinkUrl,
        metrics: [
          { icon: Heart, label: 'Lượt thích', value: row.likes },
          { icon: MessageCircle, label: 'Bình luận', value: row.comments },
        ],
      }))
      const igTotals = detail.data.topPosts.reduce(
        (accumulated, row) => ({
          likes: accumulated.likes + row.likes,
          comments: accumulated.comments + row.comments,
        }),
        { likes: 0, comments: 0 },
      )
      const igStats = [
        { label: 'Tổng lượt thích', value: igTotals.likes },
        { label: 'Tổng bình luận', value: igTotals.comments },
      ]

      return (
        <UrlTabs
          ariaLabel="Chế độ xem"
          tabs={[
            {
              id: 'overview',
              label: 'Tổng quan',
              panel: (
                <div className="flex flex-col gap-6">
                  <TrendCard
                    title="Reach theo ngày"
                    data={dailySeries.map((point) => ({
                      date: point.date,
                      reach: point.extra.reach ?? 0,
                    }))}
                    metricKey="reach"
                    label="Reach"
                  />
                  <section className="flex flex-col gap-3">
                    <SectionHead label="Bài đăng" title="Bài đăng có tương tác cao nhất" />
                    <MetaPostList
                      posts={igPosts}
                      fetchError={detail.data.fetchError}
                      emptyDescription="Chưa có bài đăng nào trong khoảng ngày này."
                    />
                  </section>
                </div>
              ),
            },
            {
              id: 'dashboard',
              label: 'Dashboard',
              panel: (
                <div className="flex flex-col gap-6">
                  <section className="flex flex-col gap-3">
                    <SectionHead
                      label="Xếp hạng"
                      title={`Bài đăng nhiều tương tác nhất — ${DATE_RANGE_LABELS[preset]}`}
                    />
                    <MetaPostList
                      posts={igPosts}
                      fetchError={detail.data.fetchError}
                      emptyDescription="Chưa có bài đăng nào trong khoảng ngày này."
                    />
                  </section>
                  <section className="flex flex-col gap-3">
                    <SectionHead
                      label="Tổng quan tương tác"
                      title={`Thống kê — ${DATE_RANGE_LABELS[preset]}`}
                    />
                    <MetaStatsSummary stats={igStats} />
                  </section>
                </div>
              ),
            },
          ]}
        />
      )
    }
```

- [ ] **Step 3: Replace `case 'facebook':`**

Current content (lines 259-281, immediately follows the block replaced in Step 2):

```typescript
    case 'facebook':
      return (
        <div className="flex flex-col gap-6">
          <TrendCard
            title="Lượt hiển thị Page theo ngày"
            data={dailySeries.map((point) => ({
              date: point.date,
              impressions: point.extra.impressions ?? 0,
            }))}
            metricKey="impressions"
            label="Lượt hiển thị"
          />
          <BreakdownSection
            label="Bài đăng"
            title="Bài đăng có tương tác cao nhất"
            rows={detail.data.topPosts.map((row) => ({
              dimension: row.message,
              cells: [formatCompact(row.reactions), formatCompact(row.comments), formatCompact(row.shares)],
            }))}
            columns={['Cảm xúc', 'Bình luận', 'Chia sẻ']}
          />
        </div>
      )
```

Replace with:

```typescript
    case 'facebook': {
      const fbPosts: readonly MetaPostItem[] = detail.data.topPosts.map((row) => ({
        title: row.message,
        thumbnailUrl: row.thumbnailUrl,
        createdAt: row.createdAt,
        permalinkUrl: row.permalinkUrl,
        metrics: [
          { icon: Heart, label: 'Cảm xúc', value: row.reactions },
          { icon: MessageCircle, label: 'Bình luận', value: row.comments },
          { icon: Share2, label: 'Chia sẻ', value: row.shares },
        ],
      }))
      const fbTotals = detail.data.topPosts.reduce(
        (accumulated, row) => ({
          reactions: accumulated.reactions + row.reactions,
          comments: accumulated.comments + row.comments,
          shares: accumulated.shares + row.shares,
        }),
        { reactions: 0, comments: 0, shares: 0 },
      )
      const fbStats = [
        { label: 'Tổng cảm xúc', value: fbTotals.reactions },
        { label: 'Tổng bình luận', value: fbTotals.comments },
        { label: 'Tổng chia sẻ', value: fbTotals.shares },
      ]

      return (
        <UrlTabs
          ariaLabel="Chế độ xem"
          tabs={[
            {
              id: 'overview',
              label: 'Tổng quan',
              panel: (
                <div className="flex flex-col gap-6">
                  <TrendCard
                    title="Lượt hiển thị Page theo ngày"
                    data={dailySeries.map((point) => ({
                      date: point.date,
                      impressions: point.extra.impressions ?? 0,
                    }))}
                    metricKey="impressions"
                    label="Lượt hiển thị"
                  />
                  <section className="flex flex-col gap-3">
                    <SectionHead label="Bài đăng" title="Bài đăng có tương tác cao nhất" />
                    <MetaPostList
                      posts={fbPosts}
                      fetchError={detail.data.fetchError}
                      emptyDescription="Chưa có bài đăng nào trong khoảng ngày này."
                    />
                  </section>
                </div>
              ),
            },
            {
              id: 'dashboard',
              label: 'Dashboard',
              panel: (
                <div className="flex flex-col gap-6">
                  <section className="flex flex-col gap-3">
                    <SectionHead
                      label="Xếp hạng"
                      title={`Bài đăng nhiều tương tác nhất — ${DATE_RANGE_LABELS[preset]}`}
                    />
                    <MetaPostList
                      posts={fbPosts}
                      fetchError={detail.data.fetchError}
                      emptyDescription="Chưa có bài đăng nào trong khoảng ngày này."
                    />
                  </section>
                  <section className="flex flex-col gap-3">
                    <SectionHead
                      label="Tổng quan tương tác"
                      title={`Thống kê — ${DATE_RANGE_LABELS[preset]}`}
                    />
                    <MetaStatsSummary stats={fbStats} />
                  </section>
                </div>
              ),
            },
          ]}
        />
      )
    }
```

- [ ] **Step 4: Confirm `BreakdownSection` is still used elsewhere**

`BreakdownSection` (the helper this task stops calling from `instagram`/`facebook`) is still used by `ga4`, `gsc`, `google-ads`/`meta-ads`, and `merchant-center`'s cases in this same file — confirm it's still present, unmodified, and still has at least one caller after this edit (it must — do not delete it).

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS with zero errors and zero new warnings.

- [ ] **Step 6: Commit**

```bash
git add src/components/channels/channel-detail-body.tsx
git commit -m "feat: wire Tổng quan/Dashboard tabs into Facebook/Instagram channel detail"
```

---

### Task 6: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: PASS, zero errors, across the whole project.

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: PASS, zero errors, zero new warnings versus the pre-existing 9 unrelated warnings.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Dev-server smoke check**

Start `npm run dev`, confirm `/{siteId}/channels/facebook` and `/{siteId}/channels/instagram` respond (likely redirected to `/sign-in` if not authenticated in this environment, same as TikTok's verification — that's expected, not a failure; the goal is confirming no 500/compile error, same limitation and same acceptance bar as the TikTok plan's Task 11). If real authenticated access is available, additionally confirm: header shows avatar/name/3 stats, tabs switch without a network re-fetch (same `UrlTabs` behavior already fixed for TikTok), post list rows open the detail dialog, and the Dashboard tab's two widgets render (or show sensible empty states if the connected test account has no posts in range).

- [ ] **Step 5: Report the result**

Summarize what changed and confirm all verification commands passed. Note explicitly that Phase 2 (top-all-time, trending-fast Dashboard widgets) is intentionally not included — it depends on the sibling session's `ContentTrendingResult` data layer, tracked separately.
