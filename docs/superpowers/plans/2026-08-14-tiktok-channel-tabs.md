# TikTok Channel Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the TikTok channel-detail page (`/[siteId]/channels/tiktok`) into a TikTok-profile-style header plus two tabs — Tổng quan (a dense TikTok-style video grid with a click-through detail dialog) and Dashboard (four ranking/trending widgets) — consuming data that's already fully fetched by the existing `getChannelDetail`.

**Architecture:** Nine new small components under `src/components/channels/tiktok/` (one per responsibility: header, grid, card, detail dialog, ranking list, trending widget, stats summary, dashboard orchestrator) plus one new generic `UrlTabs` primitive in `src/components/ui/`. Two existing files get a small, contained edit each (`page.tsx` for the header swap, `channel-detail-body.tsx`'s `case 'tiktok'` for the tab wiring); one provider file (`tiktok.ts`) gets two new fields added to an existing response shape. No new data fetching, no new Server Actions, no schema changes — everything consumes `ChannelDetail`'s `data`/`trending` fields, both already populated by the merged video-trending-pipeline work.

**Tech Stack:** Next.js 16 App Router (Server + Client Components), TypeScript, Tailwind v4 via CSS custom properties (Hallmark design tokens), Radix UI (`Dialog`), `lucide-react` icons.

## Global Constraints

- **No test framework is configured** (`vitest`/`@testing-library/*`/`@playwright/test` are devDependencies but there's no config file and no test files anywhere in `src/` — confirmed via `find`). Do not add test files or a test config as a side effect of this plan. The verification loop for every task below is `npx tsc --noEmit` (must pass with zero errors) + `npm run lint` (must pass with zero new warnings/errors) — this is the repo's actual convention (see `CLAUDE.md`), not a gap to silently fill with a test framework.
- **Hallmark token discipline:** no raw hex/oklch color values or font-family declarations outside `src/lib/design/tokens.css` — every color/spacing/radius/type-scale value in new code must be one of the existing `var(--...)` tokens or an existing Tailwind utility that resolves to one (see any existing `src/components/ui/*.tsx` file for the pattern). The one deliberate exception in this plan is the video-thumbnail overlay text (Task 4), which uses literal `white`/`black` because it composites over unpredictable photographic content, not app chrome — this mirrors how TikTok's own UI treats it and is called out explicitly in that task.
- **Component header convention:** every new component file under `src/components/` starts with `/* Hallmark · component: <kebab-case-name> · theme: studied-DNA (Ink & Signal) */`, matching the convention already on every file this plan touches or reads from.
- **Formatting:** every user-facing number goes through `src/lib/format.ts` (`formatNumber`, `formatCompact`, `formatDate`, `formatDateTime`) — never call `.toLocaleString()` or template a raw number directly, per that file's own docblock.
- **`cn()` class-merge gotcha:** any arbitrary-value Tailwind class using a CSS var (e.g. a font size) MUST use the `text-[length:var(--text-sm)]` prefix form, never bare `text-[var(--text-sm)]` — see `src/lib/cn.ts`'s docblock for why the untagged form silently loses to a later color class under `twMerge`.
- **Vietnamese comments, why only:** match the surrounding codebase's convention — comments explain a non-obvious constraint or decision, never restate what the code does. Do not add comments beyond that bar.
- **Immutability:** no mutation of props/params; build new arrays/objects (`.map`, spread, `reduce` with a fresh accumulator) as the rest of this codebase already does throughout `channel-detail-body.tsx`.

---

### Task 1: Add `createdAt` and `shareUrl` to `TiktokExplore.topVideos`

**Files:**
- Modify: `src/lib/providers/tiktok.ts:170-241`

**Interfaces:**
- Consumes: nothing new — extends the existing `fetchTiktokContentExplore` return shape.
- Produces: `TiktokExplore.topVideos[number]` now additionally carries `createdAt: string | null` (ISO 8601 datetime, derived from TikTok's `create_time` Unix-seconds field) and `shareUrl: string | null` (permalink to the video on tiktok.com). Task 4 and Task 5 depend on both of these fields existing.

The grid (Task 4) needs an exact post timestamp per video, and the detail dialog (Task 5) needs a link to the original video — neither field is in the current mapped output, even though `create_time` is already read internally for date filtering and simply discarded before the object is returned.

- [ ] **Step 1: Add `share_url` to the requested fields and to `TiktokVideoItem`**

In `src/lib/providers/tiktok.ts`, update the `TiktokVideoItem` interface (around line 170):

```typescript
interface TiktokVideoItem {
  readonly id?: string
  readonly title?: string
  /** Chú thích thật của hầu hết video — `title` phần lớn để trống vì ứng
   * dụng TikTok không có ô nhập "tiêu đề" riêng cho bài đăng thường, chỉ có
   * ô caption/mô tả. Ưu tiên field này trước `title`. */
  readonly video_description?: string
  readonly cover_image_url?: string
  readonly view_count?: number
  readonly like_count?: number
  readonly comment_count?: number
  readonly share_count?: number
  readonly create_time?: number
  readonly share_url?: string
}
```

Then update the `fields` param inside `fetchTiktokContentExplore` (around line 190-193):

```typescript
  const url = new URL(VIDEO_LIST_ENDPOINT)
  url.searchParams.set(
    'fields',
    'id,title,video_description,cover_image_url,view_count,like_count,comment_count,share_count,create_time,share_url',
  )
```

- [ ] **Step 2: Extend `TiktokExplore.topVideos` shape**

Update the `TiktokExplore` interface (around line 152-168):

```typescript
export interface TiktokExplore {
  readonly topVideos: readonly {
    readonly title: string
    readonly coverImageUrl: string | null
    readonly views: number
    readonly likes: number
    readonly comments: number
    readonly shares: number
    /** ISO 8601, dựng từ `create_time` (Unix giây) — `null` nếu TikTok bỏ
     * trống field này (đã xảy ra trong thực tế, xem điều kiện lọc bên dưới
     * chấp nhận `create_time === undefined`). */
    readonly createdAt: string | null
    /** Link xem video gốc trên tiktok.com — `null` nếu TikTok không trả field
     * này cho video đó (chưa xác nhận field luôn có mặt, CHƯA chạy thử với
     * app thật, xem docblock đầu file). */
    readonly shareUrl: string | null
  }[]
  /** `null` = tải thành công (danh sách CÓ THỂ rỗng — chọn khoảng ngày cũ
   * hơn video gần nhất, hoặc video không công khai — đó là trạng thái bình
   * thường). Khác `null` = TikTok từ chối/lỗi request, kèm lý do thô để phân
   * biệt với "chưa có video nào" — KHÔNG được lẫn hai trường hợp này, vì
   * TikTok Display API trả HTTP 200 kể cả khi có lỗi logic (mã lỗi nằm
   * trong `body.error.code`, không phải status code). */
  readonly fetchError: string | null
}
```

- [ ] **Step 3: Populate the two new fields in the `.map()`**

Update the mapping inside `fetchTiktokContentExplore` (around line 229-236):

```typescript
  const topVideos = (body.data?.videos ?? [])
    .filter(
      (video) =>
        video.create_time === undefined ||
        (video.create_time >= rangeStartSeconds && video.create_time <= rangeEndSeconds),
    )
    .map((video) => ({
      title: (video.video_description || video.title || '(không có chú thích)').slice(0, 80),
      coverImageUrl: video.cover_image_url ?? null,
      views: video.view_count ?? 0,
      likes: video.like_count ?? 0,
      comments: video.comment_count ?? 0,
      shares: video.share_count ?? 0,
      createdAt: video.create_time ? new Date(video.create_time * 1000).toISOString() : null,
      shareUrl: video.share_url ?? null,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS with zero errors. This change is purely additive (two new optional-to-produce fields on an existing object shape) — the only current consumer, `channel-detail-body.tsx`'s `case 'tiktok'`, maps `detail.data.topVideos` into `VideoCardData` with an explicit object literal that only reads the pre-existing fields, so it's unaffected by the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/tiktok.ts
git commit -m "feat: add createdAt and shareUrl to TikTok video explore data"
```

---

### Task 2: Build the `UrlTabs` primitive

**Files:**
- Create: `src/components/ui/tabs.tsx`

**Interfaces:**
- Consumes: `next/navigation`'s `usePathname`/`useSearchParams` (client-side hooks, already used elsewhere in the app, e.g. `src/components/layout/topbar.tsx`'s `DateRangeMenu`).
- Produces: `UrlTabs({ tabs, paramName?, ariaLabel })` where `tabs: readonly { id: string; label: string; panel: ReactNode }[]`. Task 10 depends on this exact prop shape.

No generic `Tabs` primitive exists yet — the only precedent, `OverviewTabs` (`src/components/overview/overview-tabs.tsx`), uses local `useState`, which doesn't survive reload/sharing. This is a URL-driven sibling for pages (like the TikTok channel page) where the active tab should be bookmarkable, following the same `?param=` pattern already established by `range`/`from`/`to` (`src/lib/domain/date-range-param.ts`).

- [ ] **Step 1: Write the component**

```typescript
'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* Hallmark · component: tabs · theme: studied-DNA (Ink & Signal)
 *
 * Biến thể URL-driven của `OverviewTabs` — state cục bộ (`useState`) không
 * sống sót qua reload/chia sẻ link. Dùng component này khi tab cần bookmark
 * được (trang chi tiết kênh); dùng `OverviewTabs` khi tab chỉ là điều hướng
 * tạm trong phiên xem hiện tại.
 */
export interface UrlTabItem {
  readonly id: string
  readonly label: string
  readonly panel: ReactNode
}

export function UrlTabs({
  tabs,
  paramName = 'tab',
  ariaLabel,
}: {
  readonly tabs: readonly UrlTabItem[]
  readonly paramName?: string
  readonly ariaLabel: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeId = searchParams.get(paramName)
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]!

  const hrefFor = (tabId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(paramName, tabId)
    return `${pathname}?${params.toString()}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex gap-1 overflow-x-auto border-b border-[var(--color-rule)]"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={hrefFor(tab.id)}
            role="tab"
            aria-selected={active.id === tab.id}
            scroll={false}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-4 py-2.5 whitespace-nowrap',
              'text-[length:var(--text-sm)] font-medium',
              'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
              active.id === tab.id
                ? 'border-[var(--color-signal)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink-3)] hover:text-[var(--color-ink)]',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {active.panel}
    </div>
  )
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS with zero errors (this file has no consumers yet, so it can't be exercised beyond compiling — that happens in Task 10).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/tabs.tsx
git commit -m "feat: add UrlTabs, a URL-driven tabs primitive"
```

---

### Task 3: Build `TiktokChannelHeader` and wire it into the channel page

**Files:**
- Create: `src/components/channels/tiktok/tiktok-channel-header.tsx`
- Modify: `src/app/(app)/[siteId]/channels/[provider]/page.tsx`

**Interfaces:**
- Consumes: `ChannelDetail` (`Extract<ChannelDetail, {kind: 'tiktok'}>`) from `src/lib/data/site-channel-detail.ts`, `ChannelDailyPoint` from `src/lib/data/site-channels.ts`, `ChannelAvatar` from `src/components/channels/channel-avatar.tsx`, `ExternalChannelLink` from `src/components/connections/external-channel-link.tsx`, `Badge` from `src/components/ui/badge.tsx`.
- Produces: `TiktokChannelHeader({ siteId, detail, dailySeries, connected, dateRangeLabel })`, a full replacement for the back-link+`PageHeader` block, TikTok-provider-only.

The reference screenshot's TikTok profile has a large avatar, the account name as the primary heading, and Follower/Likes/Video-count inline in the same row — replacing this app's current small-avatar-in-description + separate-stat-tiles-below layout, which doesn't read as a profile. **Known deviation from the reference, already recorded in the spec:** there is no `@handle` anywhere in this app's data model (the TikTok adapter never requests a `username` field — see `docs/superpowers/specs/2026-08-14-tiktok-channel-tabs-design.md`), so the header shows name only, no handle line.

- [ ] **Step 1: Write the header component**

```typescript
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ChannelAvatar } from '@/components/channels/channel-avatar'
import { ExternalChannelLink } from '@/components/connections/external-channel-link'
import { Badge } from '@/components/ui/badge'
import type { ChannelDetail } from '@/lib/data/site-channel-detail'
import type { ChannelDailyPoint } from '@/lib/data/site-channels'
import { formatNumber } from '@/lib/format'

/* Hallmark · component: tiktok-channel-header · theme: studied-DNA (Ink & Signal)
 *
 * Thay hẳn khối PageHeader mặc định cho riêng trang TikTok — avatar lớn +
 * tên + 3 số liệu cùng hàng, giống bố cục trang cá nhân TikTok thật, khác
 * hẳn khối "avatar nhỏ trong description + stat-tile tách rời bên dưới" mà
 * mọi kênh khác vẫn dùng. KHÔNG có dòng @handle: adapter TikTok hiện chỉ
 * xin field `open_id,display_name,avatar_url` từ `user/info/`, không có
 * `username` — xem docs/superpowers/specs/2026-08-14-tiktok-channel-tabs-design.md.
 */
export function TiktokChannelHeader({
  siteId,
  detail,
  dailySeries,
  connected,
  dateRangeLabel,
}: {
  readonly siteId: string
  readonly detail: Extract<ChannelDetail, { readonly kind: 'tiktok' }>
  readonly dailySeries: readonly ChannelDailyPoint[]
  readonly connected: boolean
  readonly dateRangeLabel: string
}) {
  const latest = dailySeries.length > 0 ? dailySeries[dailySeries.length - 1] : null
  const latestExtra = latest?.extra ?? {}

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
          provider="tiktok"
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
            <HeaderStat label="Follower" value={Number(latestExtra.followerCount ?? 0)} />
            <HeaderStat label="Lượt thích" value={Number(latestExtra.likesCount ?? 0)} />
            <HeaderStat label="Số video" value={Number(latestExtra.videoCount ?? 0)} />
          </div>

          <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">{dateRangeLabel}</p>
        </div>

        <ExternalChannelLink
          provider="tiktok"
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

- [ ] **Step 2: Wire it into the channel page, conditionally**

In `src/app/(app)/[siteId]/channels/[provider]/page.tsx`, add the import:

```typescript
import { TiktokChannelHeader } from '@/components/channels/tiktok/tiktok-channel-header'
```

Replace the existing back-link + `PageHeader` block (currently lines 78-119, inside `<PageShell>`):

```typescript
      <div>
        <Link
          href={`/${site.id}/channels`}
          className="mb-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] text-[length:var(--text-sm)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          <ChevronLeft aria-hidden className="size-4" />
          Tất cả kênh
        </Link>

        <PageHeader
          title={meta.label}
          description={
            detail && detail.kind !== 'unsupported' ? (
              <span className="flex items-center gap-2.5">
                <ChannelAvatar avatarUrl={detail.avatarUrl} provider={provider} size="sm" />
                {detail.accountName}
              </span>
            ) : (
              'Chưa liên kết tài khoản'
            )
          }
          action={
            detail && detail.kind !== 'unsupported' ? (
              <ExternalChannelLink
                provider={provider}
                externalAccountId={detail.externalAccountId}
                variant="secondary"
                size="md"
              />
            ) : null
          }
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <ProviderMark provider={provider} size="sm" />
              <span className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
                {formatDateRange(range.start, range.end)}
              </span>
              {summary?.connected ? <Badge tone="positive">Đã kết nối</Badge> : null}
            </div>
          }
        />
      </div>
```

with:

```typescript
      {provider === 'tiktok' && detail && detail.kind === 'tiktok' ? (
        <TiktokChannelHeader
          siteId={site.id}
          detail={detail}
          dailySeries={dailySeries}
          connected={summary?.connected ?? false}
          dateRangeLabel={formatDateRange(range.start, range.end)}
        />
      ) : (
        <div>
          <Link
            href={`/${site.id}/channels`}
            className="mb-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] text-[length:var(--text-sm)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
          >
            <ChevronLeft aria-hidden className="size-4" />
            Tất cả kênh
          </Link>

          <PageHeader
            title={meta.label}
            description={
              detail && detail.kind !== 'unsupported' ? (
                <span className="flex items-center gap-2.5">
                  <ChannelAvatar avatarUrl={detail.avatarUrl} provider={provider} size="sm" />
                  {detail.accountName}
                </span>
              ) : (
                'Chưa liên kết tài khoản'
              )
            }
            action={
              detail && detail.kind !== 'unsupported' ? (
                <ExternalChannelLink
                  provider={provider}
                  externalAccountId={detail.externalAccountId}
                  variant="secondary"
                  size="md"
                />
              ) : null
            }
            meta={
              <div className="flex flex-wrap items-center gap-2">
                <ProviderMark provider={provider} size="sm" />
                <span className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
                  {formatDateRange(range.start, range.end)}
                </span>
                {summary?.connected ? <Badge tone="positive">Đã kết nối</Badge> : null}
              </div>
            }
          />
        </div>
      )}
```

Note the outer `<div>` wrapper that previously surrounded this block in the original file is removed — the ternary now produces the top-level element directly (both branches are already self-contained blocks), so the parent JSX structure inside `<PageShell>` stays a flat sibling list, matching how the `{!summary?.connected ? ... : ...}` block right below it is already structured.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. If `tsc` complains that `detail` isn't narrowed to the `'tiktok'` variant inside the ternary's true-branch, double check the condition is written as a single `&&`-chained expression directly inside the JSX (not split across an intermediate `const`) — TypeScript's control-flow narrowing needs the check inline to carry into that branch.

- [ ] **Step 4: Commit**

```bash
git add src/components/channels/tiktok/tiktok-channel-header.tsx "src/app/(app)/[siteId]/channels/[provider]/page.tsx"
git commit -m "feat: add TikTok-profile-style channel header"
```

---

### Task 4: Build the dense video grid (`TiktokVideoGrid` + `TiktokVideoCard`, no click yet)

**Files:**
- Create: `src/components/channels/tiktok/tiktok-video-grid.tsx`
- Create: `src/components/channels/tiktok/tiktok-video-card.tsx`

**Interfaces:**
- Consumes: `TiktokExplore` type from `src/lib/providers/tiktok.ts` (Task 1's extended shape), `formatCompact`/`formatDate` from `src/lib/format.ts`, `SectionHead` from `src/components/ui/card.tsx`, `Callout`/`EmptyState` from `src/components/ui/feedback.tsx`.
- Produces: `export type TiktokVideoCardData = TiktokExplore['topVideos'][number]` (from `tiktok-video-grid.tsx` — Task 5, 6, 8, 9 all import this type from here) and `TiktokVideoGrid({ videos, fetchError })`. `TiktokVideoCard({ video })` renders one grid cell; Task 5 adds the click-to-open-dialog behavior on top of this task's plain (non-interactive) card.

This replaces the existing `VideoCardGrid`'s `sm:grid-cols-2 lg:grid-cols-3` large-card layout (`channel-detail-body.tsx:669-741`) for TikTok specifically, with a dense grid matching the reference screenshot: view count + exact post date overlaid directly on each thumbnail, no caption text on the card itself.

- [ ] **Step 1: Write `tiktok-video-grid.tsx`**

```typescript
import { AlertTriangle } from 'lucide-react'
import { SectionHead } from '@/components/ui/card'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { TiktokVideoCard } from './tiktok-video-card'
import type { TiktokExplore } from '@/lib/providers/tiktok'

export type TiktokVideoCardData = TiktokExplore['topVideos'][number]

/* Hallmark · component: tiktok-video-grid · theme: studied-DNA (Ink & Signal)
 *
 * Lưới dày (3-6 cột) thay cho lưới thẻ lớn dùng chung với YouTube — TikTok
 * có ảnh reference riêng (grid video dạng dọc 9:16 sát nhau, không caption
 * trên thẻ) nên tách hẳn khỏi `VideoCardGrid` thay vì tham số hoá thêm một
 * biến thể vào component đó.
 */
export function TiktokVideoGrid({
  videos,
  fetchError,
}: {
  readonly videos: readonly TiktokVideoCardData[]
  readonly fetchError: string | null
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead label="Video" title="Video xem nhiều nhất" />
      {fetchError ? (
        <Callout
          tone="critical"
          icon={<AlertTriangle aria-hidden className="size-5 text-[var(--color-negative)]" />}
          title="Không lấy được danh sách video"
        >
          <p>{fetchError}</p>
        </Callout>
      ) : videos.length === 0 ? (
        <EmptyState
          title="Chưa có video"
          description="Chưa có video công khai trong khoảng ngày này — TikTok chỉ trả về 20 video đăng gần nhất, chọn khoảng ngày mới hơn nếu cần."
        />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {videos.map((video, index) => (
            <TiktokVideoCard key={index} video={video} />
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Write `tiktok-video-card.tsx` (plain, no dialog yet)**

```typescript
import { Eye } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatCompact, formatDate } from '@/lib/format'
import type { TiktokVideoCardData } from './tiktok-video-grid'

/* Hallmark · component: tiktok-video-card · theme: studied-DNA (Ink & Signal)
 *
 * Chữ trắng trên nền đen mờ ở đây KHÔNG dùng token màu — đây là lớp phủ đè
 * lên ảnh chụp thật (không kiểm soát được độ sáng/tối của ảnh), khác hẳn
 * chrome ứng dụng vốn phải đổi màu theo theme sáng/tối. Trắng-trên-đen cố
 * định là đúng ở đây, giống chính TikTok làm trên lưới video của họ.
 */
export function TiktokVideoCard({ video }: { readonly video: TiktokVideoCardData }) {
  return (
    <div
      className={cn(
        'group relative aspect-[9/16] w-full overflow-hidden rounded-[var(--radius-md)]',
        'bg-[var(--color-paper-3)]',
      )}
    >
      {video.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.coverImageUrl}
          alt=""
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Eye aria-hidden className="size-6 text-[var(--color-ink-3)]" />
        </div>
      )}

      <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[length:var(--text-2xs)] font-medium text-white">
        <Eye aria-hidden className="size-3" />
        {formatCompact(video.views)}
      </span>

      {video.createdAt ? (
        <span className="absolute top-1.5 right-1.5 rounded-[var(--radius-sm)] bg-black/60 px-1.5 py-0.5 text-[length:var(--text-2xs)] font-medium text-white">
          {formatDate(video.createdAt.slice(0, 10))}
        </span>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. The `eslint-disable-next-line @next/next/no-img-element` comment matches the existing pattern in `channel-detail-body.tsx`'s `VideoCardGrid` — required because this app intentionally uses raw `<img>` for externally-hosted thumbnail URLs (TikTok CDN), not `next/image` (which would need a remote-pattern allowlist for every possible TikTok CDN host).

- [ ] **Step 4: Commit**

```bash
git add src/components/channels/tiktok/tiktok-video-grid.tsx src/components/channels/tiktok/tiktok-video-card.tsx
git commit -m "feat: add dense TikTok-style video grid"
```

---

### Task 5: Add the click-through video detail dialog

**Files:**
- Create: `src/components/channels/tiktok/tiktok-video-detail-dialog.tsx`
- Modify: `src/components/channels/tiktok/tiktok-video-card.tsx`

**Interfaces:**
- Consumes: `type TiktokVideoCardData` from `./tiktok-video-grid` (Task 4), `DialogRoot`/`DialogTrigger`/`DialogContent` from `src/components/ui/dialog.tsx`, `Button` from `src/components/ui/button.tsx`, `formatDateTime` from `src/lib/format.ts`.
- Produces: `TiktokVideoDetailDialog({ video })` — Task 4's `TiktokVideoCard` becomes the trigger.

- [ ] **Step 1: Write `tiktok-video-detail-dialog.tsx`**

```typescript
import { ExternalLink, Eye, Heart, MessageCircle, Share2 } from 'lucide-react'
import { DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatCompact, formatDateTime } from '@/lib/format'
import type { TiktokVideoCardData } from './tiktok-video-grid'

/* Hallmark · component: tiktok-video-detail-dialog · theme: studied-DNA (Ink & Signal) */
export function TiktokVideoDetailDialog({ video }: { readonly video: TiktokVideoCardData }) {
  return (
    <DialogContent
      title={video.title}
      description={
        video.createdAt
          ? formatDateTime(video.createdAt, {
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
        {video.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.coverImageUrl}
            alt=""
            className="aspect-[9/16] max-h-80 w-auto self-center rounded-[var(--radius-md)] object-cover"
          />
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <DetailStat icon={Eye} label="Lượt xem" value={formatCompact(video.views)} />
          <DetailStat icon={Heart} label="Lượt thích" value={formatCompact(video.likes)} />
          <DetailStat icon={MessageCircle} label="Bình luận" value={formatCompact(video.comments)} />
          <DetailStat icon={Share2} label="Chia sẻ" value={formatCompact(video.shares)} />
        </div>

        {video.shareUrl ? (
          <Button asChild variant="secondary" size="md">
            <a href={video.shareUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden className="size-4" />
              Xem trên TikTok
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
  readonly icon: typeof Eye
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

- [ ] **Step 2: Wire the dialog onto the card**

In `src/components/channels/tiktok/tiktok-video-card.tsx`, add imports:

```typescript
import { DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { TiktokVideoDetailDialog } from './tiktok-video-detail-dialog'
```

Replace the outer `<div className={cn('group relative aspect-[9/16]...` element and its closing `</div>` with a `DialogRoot`/`DialogTrigger` wrapping the same content as a `<button>`, plus the dialog itself:

```typescript
export function TiktokVideoCard({ video }: { readonly video: TiktokVideoCardData }) {
  return (
    <DialogRoot>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'group relative aspect-[9/16] w-full overflow-hidden rounded-[var(--radius-md)]',
            'bg-[var(--color-paper-3)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
          )}
        >
          {video.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={video.coverImageUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Eye aria-hidden className="size-6 text-[var(--color-ink-3)]" />
            </div>
          )}

          <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[length:var(--text-2xs)] font-medium text-white">
            <Eye aria-hidden className="size-3" />
            {formatCompact(video.views)}
          </span>

          {video.createdAt ? (
            <span className="absolute top-1.5 right-1.5 rounded-[var(--radius-sm)] bg-black/60 px-1.5 py-0.5 text-[length:var(--text-2xs)] font-medium text-white">
              {formatDate(video.createdAt.slice(0, 10))}
            </span>
          ) : null}
        </button>
      </DialogTrigger>

      <TiktokVideoDetailDialog video={video} />
    </DialogRoot>
  )
}
```

`DialogRoot`/`DialogTrigger` are Radix primitives re-exported from `src/components/ui/dialog.tsx` (`'use client'` internally) — `TiktokVideoCard` itself doesn't need its own `'use client'` directive because it has no hooks/handlers of its own, it just composes an already-client component tree, same pattern as any other Server Component rendering a client child.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/channels/tiktok/tiktok-video-detail-dialog.tsx src/components/channels/tiktok/tiktok-video-card.tsx
git commit -m "feat: add click-through video detail dialog to TikTok grid"
```

---

### Task 6: Build the shared ranking list (`TiktokVideoRankingList`)

**Files:**
- Create: `src/components/channels/tiktok/tiktok-video-ranking-list.tsx`

**Interfaces:**
- Consumes: `Card` from `src/components/ui/card.tsx`, `EmptyState` from `src/components/ui/feedback.tsx`, `formatCompact` from `src/lib/format.ts`.
- Produces: `TiktokVideoRankingList({ items, emptyTitle, emptyDescription })` where `items: readonly { title: string; thumbnailUrl: string | null; views: number }[]` — a minimal structural shape. Task 9 depends on this exact prop shape; both `TiktokVideoCardData` (Task 4, via `coverImageUrl`/`views`) and `VideoSummary` (`src/lib/providers/video-trending-types.ts`, via `thumbnailUrl`/`views`) satisfy it once mapped to `{ title, thumbnailUrl, views }` — see Task 9 for the two call sites.

This is Dashboard widgets 1 ("top 10 trong khoảng lọc") and 2 ("top 10 mọi thời gian") — same rendering, two different data sources (see spec).

- [ ] **Step 1: Write the component**

```typescript
import { Eye } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { formatCompact } from '@/lib/format'

export interface RankedVideoItem {
  readonly title: string
  readonly thumbnailUrl: string | null
  readonly views: number
}

/* Hallmark · component: tiktok-video-ranking-list · theme: studied-DNA (Ink & Signal)
 *
 * Dùng chung cho hai widget xếp hạng khác nguồn dữ liệu (top trong khoảng
 * lọc / top mọi thời gian) — cả hai chỉ cần rank + thumbnail + tiêu đề +
 * view, nên rút về MỘT hình dạng tối thiểu thay vì hai component gần giống
 * hệt nhau.
 */
export function TiktokVideoRankingList({
  items,
  emptyTitle,
  emptyDescription,
}: {
  readonly items: readonly RankedVideoItem[]
  readonly emptyTitle: string
  readonly emptyDescription: string
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <Card className="flex flex-col divide-y divide-[var(--color-rule)] overflow-hidden p-0">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <span
            data-numeric
            className="w-5 shrink-0 text-[length:var(--text-sm)] font-semibold text-[var(--color-ink-3)]"
          >
            {index + 1}
          </span>
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnailUrl}
              alt=""
              className="size-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
            />
          ) : (
            <div className="size-10 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-paper-3)]" />
          )}
          <p
            className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] text-[var(--color-ink)]"
            title={item.title}
          >
            {item.title}
          </p>
          <span
            data-numeric
            className="flex shrink-0 items-center gap-1 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]"
          >
            <Eye aria-hidden className="size-3.5 text-[var(--color-ink-3)]" />
            {formatCompact(item.views)}
          </span>
        </div>
      ))}
    </Card>
  )
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/channels/tiktok/tiktok-video-ranking-list.tsx
git commit -m "feat: add shared TikTok video ranking list widget"
```

---

### Task 7: Build the trending widget (`TiktokTrendingWidget`)

**Files:**
- Create: `src/components/channels/tiktok/tiktok-trending-widget.tsx`

**Interfaces:**
- Consumes: `VideoTrendingWindows`, `VideoGrowthSummary`, `TRENDING_WINDOW_DAYS` from `src/lib/providers/video-trending-types.ts` (all already defined and exported — see that file's current content), `Card`/`CardHeader` from `src/components/ui/card.tsx`, `Button` from `src/components/ui/button.tsx`, `EmptyState` from `src/components/ui/feedback.tsx`, `formatNumber`/`formatCompact` from `src/lib/format.ts`.
- Produces: `TiktokTrendingWidget({ trendingFast, earliestSnapshotAt })`. Task 9 depends on this exact prop shape (`trendingFast: VideoTrendingWindows`, `earliestSnapshotAt: string | null` — both are direct fields of `VideoTrendingResult`, so the caller in Task 9 passes `detail.trending.trendingFast` and `detail.trending.earliestSnapshotAt` with no mapping).

Per the spec: filter each window to `growthPct > 0` (the backend doesn't exclude flat/negative growth itself), and use `earliestSnapshotAt` to distinguish "not enough history yet" from "genuinely nothing trending" in the empty state — a window can have real history but still end up empty after the positive-only filter, and those two cases need different copy.

- [ ] **Step 1: Write the component**

```typescript
'use client'

import { useState } from 'react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { formatCompact, formatNumber } from '@/lib/format'
import {
  TRENDING_WINDOW_DAYS,
  type VideoGrowthSummary,
  type VideoTrendingWindows,
} from '@/lib/providers/video-trending-types'

const WINDOW_LABELS: Readonly<Record<keyof VideoTrendingWindows, string>> = {
  week: 'Tuần',
  month: 'Tháng',
  year: 'Năm',
}

const WINDOW_KEYS = Object.keys(WINDOW_LABELS) as readonly (keyof VideoTrendingWindows)[]

/* Hallmark · component: tiktok-trending-widget · theme: studied-DNA (Ink & Signal)
 *
 * Ba cửa sổ đã có sẵn trong MỘT payload (xem VideoTrendingResult) — chuyển
 * đổi ở đây là state client thuần, không gọi lại server.
 */
export function TiktokTrendingWidget({
  trendingFast,
  earliestSnapshotAt,
}: {
  readonly trendingFast: VideoTrendingWindows
  readonly earliestSnapshotAt: string | null
}) {
  const [activeWindow, setActiveWindow] = useState<keyof VideoTrendingWindows>('week')

  // Backend không tự loại video đứng yên/giảm — yêu cầu gốc là "thay đổi
  // đáng tích cực", nên lọc ở đây.
  const positiveEntries = trendingFast[activeWindow].filter((entry) => (entry.growthPct ?? 0) > 0)

  const hasEnoughHistory =
    earliestSnapshotAt !== null &&
    new Date(earliestSnapshotAt).getTime() <= Date.now() - TRENDING_WINDOW_DAYS[activeWindow] * 86_400_000

  return (
    <Card>
      <CardHeader
        title="Video có xu hướng tăng nhanh"
        action={
          <div className="flex gap-1">
            {WINDOW_KEYS.map((key) => (
              <Button
                key={key}
                type="button"
                variant={activeWindow === key ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setActiveWindow(key)}
              >
                {WINDOW_LABELS[key]}
              </Button>
            ))}
          </div>
        }
      />
      <div className="flex flex-col gap-3 px-5 pb-5">
        {positiveEntries.length === 0 ? (
          <EmptyState
            title={hasEnoughHistory ? 'Chưa có video tăng trưởng tích cực' : 'Đang tích lũy dữ liệu'}
            description={
              hasEnoughHistory
                ? `Chưa có video nào tăng trưởng tích cực trong ${WINDOW_LABELS[activeWindow].toLowerCase()} này.`
                : `Kết nối chưa đủ lịch sử cho khung ${WINDOW_LABELS[activeWindow].toLowerCase()} — quay lại sau khi đồng bộ thêm.`
            }
          />
        ) : (
          <ol className="flex flex-col divide-y divide-[var(--color-rule)]">
            {positiveEntries.map((entry, index) => (
              <TrendingRow key={index} rank={index + 1} entry={entry} />
            ))}
          </ol>
        )}
      </div>
    </Card>
  )
}

function TrendingRow({ rank, entry }: { readonly rank: number; readonly entry: VideoGrowthSummary }) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        data-numeric
        className="w-5 shrink-0 text-[length:var(--text-sm)] font-semibold text-[var(--color-ink-3)]"
      >
        {rank}
      </span>
      {entry.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.thumbnailUrl}
          alt=""
          className="size-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
        />
      ) : (
        <div className="size-10 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-paper-3)]" />
      )}
      <p className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] text-[var(--color-ink)]" title={entry.title}>
        {entry.title}
      </p>
      <div className="flex shrink-0 flex-col items-end">
        <span data-numeric className="text-[length:var(--text-sm)] font-semibold text-[var(--color-positive)]">
          +{formatNumber(Math.round((entry.growthPct ?? 0) * 100))}%
        </span>
        <span data-numeric className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
          +{formatCompact(entry.growthDelta)} views
        </span>
      </div>
    </li>
  )
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/channels/tiktok/tiktok-trending-widget.tsx
git commit -m "feat: add TikTok trending-fast widget with week/month/year toggle"
```

---

### Task 8: Build the aggregate stats widget (`TiktokStatsSummary`)

**Files:**
- Create: `src/components/channels/tiktok/tiktok-stats-summary.tsx`

**Interfaces:**
- Consumes: `type TiktokVideoCardData` from `./tiktok-video-grid` (Task 4), `Card` from `src/components/ui/card.tsx`, `formatNumber` from `src/lib/format.ts`.
- Produces: `TiktokStatsSummary({ videos })`. Task 9 passes `detail.data.topVideos` directly (same source as widget 1 — see spec).

Sums `likes`/`comments`/`shares` across the same filtered video set as widget 1 — no new fetch, no `MetricKey`/`StatTile` (that primitive's `metric` prop is typed to `AdditiveMetricKey | keyof DerivedMetrics` from `src/lib/metrics/types.ts`, which covers ads/analytics metrics like `clicks`/`conversions` — `likes`/`comments`/`shares` aren't part of that system, so this widget uses a plain label+value tile instead, the same shape as the existing (unexported) `MerchantStat` in `channel-detail-body.tsx:619-650`).

- [ ] **Step 1: Write the component**

```typescript
import { Card } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'
import type { TiktokVideoCardData } from './tiktok-video-grid'

/* Hallmark · component: tiktok-stats-summary · theme: studied-DNA (Ink & Signal) */
export function TiktokStatsSummary({ videos }: { readonly videos: readonly TiktokVideoCardData[] }) {
  const totals = videos.reduce(
    (accumulated, video) => ({
      likes: accumulated.likes + video.likes,
      comments: accumulated.comments + video.comments,
      shares: accumulated.shares + video.shares,
    }),
    { likes: 0, comments: 0, shares: 0 },
  )

  return (
    <div className="grid grid-cols-3 gap-3">
      <SummaryTile label="Tổng lượt thích" value={totals.likes} />
      <SummaryTile label="Tổng bình luận" value={totals.comments} />
      <SummaryTile label="Tổng chia sẻ" value={totals.shares} />
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
git add src/components/channels/tiktok/tiktok-stats-summary.tsx
git commit -m "feat: add TikTok aggregate engagement stats widget"
```

---

### Task 9: Assemble the Dashboard tab (`TiktokDashboard`)

**Files:**
- Create: `src/components/channels/tiktok/tiktok-dashboard.tsx`

**Interfaces:**
- Consumes: `TiktokVideoRankingList` (Task 6), `TiktokTrendingWidget` (Task 7), `TiktokStatsSummary` (Task 8), `type TiktokVideoCardData` from `./tiktok-video-grid` (Task 4), `VideoTrendingResult` from `src/lib/providers/video-trending-types.ts`, `SectionHead` from `src/components/ui/card.tsx`.
- Produces: `TiktokDashboard({ topVideosInRange, trending, rangeLabel })`. Task 10 depends on this exact prop shape.

- [ ] **Step 1: Write the component**

```typescript
import { SectionHead } from '@/components/ui/card'
import { TiktokVideoRankingList } from './tiktok-video-ranking-list'
import { TiktokTrendingWidget } from './tiktok-trending-widget'
import { TiktokStatsSummary } from './tiktok-stats-summary'
import type { TiktokVideoCardData } from './tiktok-video-grid'
import type { VideoTrendingResult } from '@/lib/providers/video-trending-types'

/* Hallmark · component: tiktok-dashboard · theme: studied-DNA (Ink & Signal)
 *
 * Bốn widget độc lập, không có widget nào tự fetch gì thêm — `topVideosInRange`
 * và `trending` đều đã có sẵn trên `detail` trước khi trang này render (xem
 * getChannelDetail's `case 'tiktok'`), tab chỉ là chế độ hiển thị khác đi.
 */
export function TiktokDashboard({
  topVideosInRange,
  trending,
  rangeLabel,
}: {
  readonly topVideosInRange: readonly TiktokVideoCardData[]
  readonly trending: VideoTrendingResult
  readonly rangeLabel: string
}) {
  const rankedInRange = topVideosInRange.map((video) => ({
    title: video.title,
    thumbnailUrl: video.coverImageUrl,
    views: video.views,
  }))
  const rankedAllTime = trending.topAllTime.slice(0, 10).map((video) => ({
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    views: video.views,
  }))

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHead label="Xếp hạng" title={`Video xem nhiều nhất — ${rangeLabel}`} />
        <TiktokVideoRankingList
          items={rankedInRange}
          emptyTitle="Chưa có video"
          emptyDescription="Chưa có video công khai trong khoảng ngày này."
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead label="Xếp hạng" title="Video xem nhiều nhất mọi thời gian" />
        <TiktokVideoRankingList
          items={rankedAllTime}
          emptyTitle="Chưa có dữ liệu"
          emptyDescription="Video sẽ xuất hiện sau lần đồng bộ tiếp theo."
        />
      </section>

      <TiktokTrendingWidget
        trendingFast={trending.trendingFast}
        earliestSnapshotAt={trending.earliestSnapshotAt}
      />

      <section className="flex flex-col gap-3">
        <SectionHead label="Tổng quan tương tác" title={`Thống kê — ${rangeLabel}`} />
        <TiktokStatsSummary videos={topVideosInRange} />
      </section>
    </div>
  )
}
```

Note: `rankedInRange`/`rankedAllTime` are explicit small mapping steps (not passed directly) — `TiktokVideoCardData` uses `coverImageUrl` while `VideoSummary` (`trending.topAllTime`'s item type) uses `thumbnailUrl`; `RankedVideoItem` standardizes on `thumbnailUrl`, so the TikTok-explore-sourced list needs the field renamed here even though structurally most other fields already line up.

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/channels/tiktok/tiktok-dashboard.tsx
git commit -m "feat: assemble TikTok Dashboard tab from its four widgets"
```

---

### Task 10: Wire tabs into `ChannelDetailBody`'s TikTok case

**Files:**
- Modify: `src/components/channels/channel-detail-body.tsx:280-326`

**Interfaces:**
- Consumes: `UrlTabs` (Task 2), `TiktokVideoGrid` (Task 4), `TiktokDashboard` (Task 9), `DATE_RANGE_LABELS` from `src/lib/domain/site.ts` (already imports `DateRangePreset` from the same file, just needs `DATE_RANGE_LABELS` added to that import).
- Produces: the finished `case 'tiktok'` branch — no further tasks depend on this file's shape.

- [ ] **Step 1: Add imports**

At the top of `src/components/channels/channel-detail-body.tsx`, update the `@/lib/domain/site` import (currently `import type { DateRangePreset } from '@/lib/domain/site'`) to:

```typescript
import { DATE_RANGE_LABELS, type DateRangePreset } from '@/lib/domain/site'
```

Add these new imports alongside the other component imports near the top of the file:

```typescript
import { UrlTabs } from '@/components/ui/tabs'
import { TiktokVideoGrid } from '@/components/channels/tiktok/tiktok-video-grid'
import { TiktokDashboard } from '@/components/channels/tiktok/tiktok-dashboard'
```

- [ ] **Step 2: Replace the `case 'tiktok'` branch**

Replace the entire block (currently lines 280-326):

```typescript
    case 'tiktok': {
      const latest = dailySeries.length > 0 ? dailySeries[dailySeries.length - 1] : null
      const latestExtra = latest?.extra ?? {}
      return (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-3">
            <MerchantStat label="Follower" value={latestExtra.followerCount ?? 0} />
            <MerchantStat label="Lượt thích" value={latestExtra.likesCount ?? 0} />
            <MerchantStat label="Số video" value={latestExtra.videoCount ?? 0} />
          </div>

          {dailySeries.length > 0 ? (
            <Card>
              <CardHeader
                title="Follower theo lần đồng bộ"
                description="TikTok Display API không có báo cáo lịch sử theo ngày — mỗi điểm là trạng thái tài khoản TẠI lần đồng bộ đó, không phải phát sinh trong ngày."
              />
              <CardBody>
                <TrendChart
                  data={dailySeries.map((point) => ({
                    date: point.date,
                    follower: point.extra.followerCount ?? 0,
                  }))}
                  series={[{ key: 'follower', label: 'Follower', colorToken: '--color-signal', kind: 'line' }]}
                  format="number"
                />
              </CardBody>
            </Card>
          ) : null}

          <VideoCardGrid
            label="Video"
            title="Video xem nhiều nhất"
            emptyDescription="Chưa có video công khai trong khoảng ngày này — TikTok chỉ trả về 20 video đăng gần nhất, chọn khoảng ngày mới hơn nếu cần."
            fetchError={detail.data.fetchError}
            videos={detail.data.topVideos.map((row) => ({
              title: row.title,
              thumbnailUrl: row.coverImageUrl,
              views: row.views,
              likes: row.likes,
              comments: row.comments,
              shares: row.shares,
            }))}
          />
        </div>
      )
    }
```

with:

```typescript
    case 'tiktok': {
      const followerTrend =
        dailySeries.length > 0 ? (
          <Card>
            <CardHeader
              title="Follower theo lần đồng bộ"
              description="TikTok Display API không có báo cáo lịch sử theo ngày — mỗi điểm là trạng thái tài khoản TẠI lần đồng bộ đó, không phải phát sinh trong ngày."
            />
            <CardBody>
              <TrendChart
                data={dailySeries.map((point) => ({
                  date: point.date,
                  follower: point.extra.followerCount ?? 0,
                }))}
                series={[{ key: 'follower', label: 'Follower', colorToken: '--color-signal', kind: 'line' }]}
                format="number"
              />
            </CardBody>
          </Card>
        ) : null

      return (
        <UrlTabs
          ariaLabel="Chế độ xem"
          tabs={[
            {
              id: 'overview',
              label: 'Tổng quan',
              panel: (
                <div className="flex flex-col gap-6">
                  {followerTrend}
                  <TiktokVideoGrid videos={detail.data.topVideos} fetchError={detail.data.fetchError} />
                </div>
              ),
            },
            {
              id: 'dashboard',
              label: 'Dashboard',
              panel: (
                <TiktokDashboard
                  topVideosInRange={detail.data.topVideos}
                  trending={detail.trending}
                  rangeLabel={DATE_RANGE_LABELS[preset]}
                />
              ),
            },
          ]}
        />
      )
    }
```

The three `MerchantStat` tiles that used to open this branch are gone — that same data (Follower/Lượt thích/Số video) now lives in `TiktokChannelHeader` (Task 3), not duplicated here. `MerchantStat` itself stays in this file (still used by `MerchantCenterSection`), and `VideoCardGrid`/`VideoStat` also stay (still used by the `youtube` case) — neither is being deleted, only TikTok stops calling them.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS with zero errors and zero new warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/channels/channel-detail-body.tsx
git commit -m "feat: wire Tổng quan/Dashboard tabs into TikTok channel detail"
```

---

### Task 11: Full verification pass

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: PASS, zero errors, across the whole project (not just touched files — confirms nothing else broke).

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: PASS, zero errors, zero new warnings compared to `git stash` (if any pre-existing warnings are unrelated to this change, that's fine — don't fix unrelated lint debt as a side effect).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: PASS. This also regenerates `.next/types`, which is the fastest way to catch a Server/Client Component boundary mistake (e.g. a `'use client'` missing somewhere) that `tsc --noEmit` alone won't always catch.

- [ ] **Step 4: Visual check on the dev server**

Run: `npm run dev` (background), then navigate to a site's TikTok channel page (`/{siteId}/channels/tiktok`) in a browser.

Check:
- Header shows a large avatar, the account name, Follower/Lượt thích/Số video inline, the connected badge, and the date-range label — no more generic "TikTok" page title.
- "Tổng quan"/"Dashboard" tabs render, switching between them updates the URL's `?tab=` param and survives a manual page reload.
- Tổng quan tab: dense video grid (3-6 columns depending on viewport width), each cell shows a view count and a date in the corners; clicking a cell opens a dialog with the full caption, all 4 stats, the exact date/time, and (if `shareUrl` is present in the fetched data) a "Xem trên TikTok" link.
- Dashboard tab: four sections render — top-10-in-range list, top-10-all-time list, the trending widget with a working week/month/year toggle, and the three aggregate stat tiles. If the connected TikTok account has no `video_metrics_daily` history yet (a very likely case for a fresh connection), confirm the all-time and trending sections show their empty states rather than erroring.
- Changing the page's date-range picker (top bar) updates the Tổng quan grid and the Dashboard's "top-in-range" list, but does **not** change the all-time list or the trending widget's rankings (only its own week/month/year toggle does) — this is the deliberate behavior from the spec, verify it isn't accidentally coupled to the page-level range.

If anything above doesn't match, fix it before considering this plan done — this is the actual acceptance check, since there's no automated test suite standing in for it.

- [ ] **Step 5: Report the result**

Summarize what changed (header, tabs, grid, dialog, dashboard) and confirm all four verification commands passed, per the user's request to "cho tôi thấy kết quả" — no further commit needed for this task (it's verification-only).
