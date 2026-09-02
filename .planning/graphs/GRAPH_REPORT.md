# Graph Report - Marketing-Optimizer  (2026-09-02)

## Corpus Check
- 419 files · ~599,012 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2545 nodes · 6522 edges · 212 communities (154 shown, 58 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 49 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ef86bdd2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- site-channel-detail.ts
- providers/index.ts
- topbar.tsx
- domain/geo.ts
- google-discovery.ts
- agents/page.tsx
- channel-detail-body.tsx
- overview/page.tsx
- providers/types.ts
- providers.ts
- getSite
- compilerOptions
- dependencies
- devDependencies
- actions/google-ads.ts
- data/plans.ts
- connections/page.tsx
- cn
- mock/entities.ts
- ai-visibility/page.tsx
- ProviderId
- domain/audit.ts
- actions/audit.ts
- edit-site-form.tsx
- pagespeed-report.tsx
- actions/plans.ts
- ai-key-setup.tsx
- button.tsx
- rules/index.ts
- metrics.ts
- createAdminClient
- createClient
- meta-discovery.ts
- actions/prompts.ts
- metrics/types.ts
- data/connections.ts
- [provider]/page.tsx
- Communities (114 total, 37 thin omitted)
- crawler.ts
- new-plan-dialog.tsx
- citability.ts
- google-ads-accounts.ts
- delta.tsx
- database.types.ts
- actions/site.ts
- auth.ts
- site-insights.ts
- klaviyo.ts
- 20260812000001_init_auth_and_sites.sql
- package.json
- run-agent.ts
- feedback.tsx
- report-builder.tsx
- mobile-nav-drawer.tsx
- date-picker-field.tsx
- 20260813000008_planner.sql
- public.audit_runs
- 20260812000004_app_settings.sql
- google-explore.ts
- formatCompact
- public.connections
- README.md
- icon.tsx
- proxy.ts
- public.site_oauth_apps
- public.tracked_prompts
- check-email/page.tsx
- public.metrics_daily
- public.create_plan_item_with_deployment
- AGENTS.md
- site-channels.ts
- eslint.config.mjs
- meta-trending-widget.tsx
- next.config.ts
- google-merchant.ts
- tailwind-merge
- zod
- Global Constraints
- Prompt Studio + Agents — real data layer, LLM integration, tool-calling loop
- data/agents.ts
- agent-suggestions.ts
- vitest
- postcss.config.mjs
- vercel.json
- Architecture
- public.metrics_daily
- public.profiles
- public.profiles
- public.site_oauth_apps
- public.connections
- public.audit_runs
- public.audit_runs
- public.site_oauth_apps
- public.site_oauth_apps
- public.audit_runs
- public.audit_runs
- public.plan_items
- public.sites
- public.plan_items
- public.plans
- public.connections
- public.plan_items
- theme-toggle.tsx
- Global Constraints
- Facebook + Instagram channel pages: Tổng quan / Dashboard tabs
- sites.ts
- settings/page.tsx
- Global Constraints
- Global Constraints
- actions/agents.ts
- actions/tracked-prompts.ts
- Facebook/Instagram channel pages: Tổng quan / Dashboard tabs
- TikTok channel page: Tổng quan / Dashboard tabs
- meta-metrics.ts
- Ghi nhớ site đã chọn gần nhất
- app/layout.tsx
- new-agent-dialog.tsx
- market-detection.ts
- google-metrics.ts
- Global Constraints
- run-agents/route.ts
- stats-donut.tsx
- pagespeed.ts
- tiktok.ts
- Multi-provider AI keys — design
- Graph Report - Marketing-Optimizer  (2026-08-13)
- legal-page-shell.tsx
- mock/agents.ts
- Global Constraints
- Video metrics snapshot pipeline (TikTok + YouTube trending/top-all-time)
- AEO audit category — design
- Real LLM citation checking + topic-based question suggestions — design
- sync.ts
- side-rail.tsx
- public.get_video_trending_snapshots
- Global Constraints
- public.agent_runs
- data-gate.tsx
- google.ts
- public.get_video_range_growth
- public.get_video_trending_snapshots
- public.get_video_trending_snapshots
- public.get_content_trending_snapshots
- public.get_content_trending_snapshots
- public.prompt_runs
- public.get_video_range_snapshots
- public.get_video_range_snapshots
- public.backfill_media_targets
- apple-icon.tsx
- public.site_ai_keys
- public.pending_google_connections
- public.insight_actions
- public.site_invite_links
- pagination.tsx
- public.video_metrics_daily
- public.content_metrics_daily
- public.get_videos_posted_in_range
- public.get_videos_posted_in_range
- eslint
- @google/genai
- lucide-react
- openai
- react-dom
- recharts
- @supabase/ssr
- @tanstack/react-query
- @vercel/analytics
- @types/node
- 20260827000002_media_backfill_failures.sql
- public.site_oauth_apps
- public.connections
- public.profiles
- public.content_metrics_daily
- public.site_ai_keys
- public.audit_runs
- public.audit_runs
- public.site_ai_keys
- public.audit_runs
- public.connections
- public.plan_items
- public.video_metrics_daily
- public.connections

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 132 edges
2. `cn()` - 102 edges
3. `createAdminClient()` - 87 edges
4. `Communities (114 total, 37 thin omitted)` - 65 edges
5. `ProviderId` - 63 edges
6. `Button` - 55 edges
7. `formatNumber()` - 47 edges
8. `Card()` - 43 edges
9. `getSite` - 43 edges
10. `formatCompact()` - 36 edges

## Surprising Connections (you probably didn't know these)
- `generateMetadata()` --calls--> `isProviderId()`  [EXTRACTED]
  src/app/(app)/[siteId]/channels/[provider]/page.tsx → src/lib/domain/providers.ts
- `ConnectionCard()` --calls--> `formatRelativeTime()`  [EXTRACTED]
  src/app/(app)/[siteId]/connections/page.tsx → src/lib/format.ts
- `NotFound()` --calls--> `getCurrentUser()`  [EXTRACTED]
  src/app/not-found.tsx → src/lib/supabase/server.ts
- `ToolChoice` --references--> `ProviderId`  [EXTRACTED]
  src/components/agents/new-agent-dialog.tsx → src/lib/domain/providers.ts
- `ToolRow()` --calls--> `cn()`  [EXTRACTED]
  src/components/agents/new-agent-dialog.tsx → src/lib/cn.ts

## Import Cycles
- None detected.

## Communities (212 total, 58 thin omitted)

### Community 0 - "site-channel-detail.ts"
Cohesion: 0.09
Nodes (41): GscOverviewPanelProps, collectKlaviyoExtras(), collectMetaFollowerCounts(), EMPTY_KLAVIYO_EXTRAS, fetchMetaFollowerCounts, KlaviyoExtras, MetaFollowerCount, CampaignExplore (+33 more)

### Community 1 - "providers/index.ts"
Cohesion: 0.17
Nodes (13): FacebookInsightMetric, FacebookInsightValue, facebookMetricsAdapter, GraphErrorBody, ZERO_ROW, googleAdsMetricsAdapter, merchantCenterMetricsAdapter, METRICS_ADAPTERS (+5 more)

### Community 2 - "topbar.tsx"
Cohesion: 0.11
Nodes (21): DATE_PRESETS, DatePickerField, DateRangeMenu(), describeResync(), RESYNC_INITIAL_STATE, SiteSwitcher(), SyncAllButton(), TopbarProps (+13 more)

### Community 3 - "domain/geo.ts"
Cohesion: 0.11
Nodes (25): CitationCheckRow, getLatestCitationCheckByPrompt(), toCitationCheck(), listTrackedPrompts(), toTrackedPrompt(), TrackedPromptRow, AI_ENGINE_LABELS, AiEngine (+17 more)

### Community 4 - "google-discovery.ts"
Cohesion: 0.12
Nodes (31): normalizeHostname(), API_CHECK_TARGETS, authHeader(), checkGoogleApiErrors(), discoverGoogleAccounts(), fetchAllGtmContainers(), GA4_DATA_STREAMS_ENDPOINT(), Ga4AccountSummary (+23 more)

### Community 5 - "agents/page.tsx"
Cohesion: 0.15
Nodes (18): AgentCard(), metadata, RUN_TONE, ApprovalQueue(), NewAgentDialog(), ActionDiffRow, AGENT_ROLE_LABELS, AgentRunStatus (+10 more)

### Community 6 - "channel-detail-body.tsx"
Cohesion: 0.06
Nodes (40): BreakdownTable(), PlanSection(), ChannelHeadline(), ChannelDetailBody(), MerchantStat(), PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONE, VideoCardData (+32 more)

### Community 7 - "overview/page.tsx"
Cohesion: 0.12
Nodes (37): metadata, SPEND_PROVIDERS, metadata, ChannelComparisonPanel(), format(), formatDeltaPct(), DimensionId, Row (+29 more)

### Community 8 - "providers/types.ts"
Cohesion: 0.12
Nodes (12): OAuthAppSetupProps, ProviderFamily, META_ADS_SCOPE, metaAdapter, MetaTokenResponse, SCOPES, OAuthCredentials, OAuthFamilyAdapter (+4 more)

### Community 9 - "providers.ts"
Cohesion: 0.14
Nodes (24): GET(), GET(), OAUTH_STATE_COOKIE, connectKlaviyo(), schema, saveSiteOAuthApp(), schema, decrypt() (+16 more)

### Community 10 - "getSite"
Cohesion: 0.24
Nodes (19): ChannelsPage(), metadata, ChannelDetailPage(), EMPTY_SOURCE, ExplorePage(), familySource(), hasData(), metadata (+11 more)

### Community 11 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 12 - "dependencies"
Cohesion: 0.08
Nodes (25): @anthropic-ai/sdk, cheerio, class-variance-authority, clsx, date-fns, fast-xml-parser, next, dependencies (+17 more)

### Community 13 - "devDependencies"
Cohesion: 0.07
Nodes (29): eslint-config-next, jsdom, msw, devDependencies, eslint-config-next, jsdom, msw, @playwright/test (+21 more)

### Community 14 - "actions/google-ads.ts"
Cohesion: 0.15
Nodes (18): ConnectGoogleAdsButton(), INITIAL_STATE, ConnectGtmButton(), INITIAL_STATE, GtmPicker(), connectGoogleAdsAccount(), ConnectGoogleAdsState, schema (+10 more)

### Community 15 - "data/plans.ts"
Cohesion: 0.12
Nodes (26): PlannerPage(), DeploymentStatusSelect(), PlanStatusSelect(), selectClass, StatusSelectField(), DeploymentRow, listDeployments(), listPlans() (+18 more)

### Community 16 - "connections/page.tsx"
Cohesion: 0.10
Nodes (21): ConnectionCard(), ConnectionsPage(), metadata, OAUTH_ERROR_LABELS, STATUS_TONE, familyMembers(), DisconnectConnectionButton(), KlaviyoConnectCard() (+13 more)

### Community 17 - "cn"
Cohesion: 0.09
Nodes (25): metadata, OnboardingPage(), Mark(), MarkProps, SIZE_CLASS, Wordmark(), WordmarkProps, AdsDeveloperTokenGuide() (+17 more)

### Community 18 - "mock/entities.ts"
Cohesion: 0.16
Nodes (16): Entity, ENTITY_KIND_LABELS, ENTITY_STATUS_LABELS, EntityKind, EntityStatus, PRIMARY_ENTITY_KIND, averagePositionOf(), entitiesOf() (+8 more)

### Community 19 - "ai-visibility/page.tsx"
Cohesion: 0.08
Nodes (33): RUN_TONE, RunDetail(), STEP_LABELS, RunRow(), AiVisibilityPage(), metadata, metadata, ROLE_LABELS (+25 more)

### Community 20 - "ProviderId"
Cohesion: 0.11
Nodes (24): ProviderMarkProps, InsightCard(), InsightCardProps, SEVERITY_TONE, clearActionSchema, clearInsightAction(), setActionSchema, setInsightAction() (+16 more)

### Community 21 - "domain/audit.ts"
Cohesion: 0.11
Nodes (28): AuditPage(), maxDuration, metadata, AuditCategoryPanel(), scoreColorVar, scoreTone(), STATUS_ICON, STATUS_ORDER (+20 more)

### Community 22 - "actions/audit.ts"
Cohesion: 0.20
Nodes (15): INITIAL_STATE, RunAuditButton(), INITIAL_STATE, performAuditScan(), RunAuditState, runSiteAuditAction(), realPagesOf(), fetchPageSpeedInsights() (+7 more)

### Community 23 - "edit-site-form.tsx"
Cohesion: 0.21
Nodes (10): CURRENCY_OPTIONS, EditSiteForm(), TIMEZONE_OPTIONS, updateSite(), COUNTRY_OPTIONS, TLD_MARKET, CurrencyOption, listCurrencyOptions() (+2 more)

### Community 24 - "pagespeed-report.tsx"
Cohesion: 0.20
Nodes (8): PageSpeedReport(), ScoreGauge(), STRATEGY_ICON, STRATEGY_LABEL, Tone, TONE_COLOR, TONE_LABEL, toneOfScore()

### Community 25 - "actions/plans.ts"
Cohesion: 0.10
Nodes (20): AddPlanItemDialog(), NewPlanDialog(), createPlanAction(), createPlanItemAction(), createPlanItemSchema, createPlanSchema, deletePlanItemAction(), deletePlanItemSchema (+12 more)

### Community 26 - "ai-key-setup.tsx"
Cohesion: 0.06
Nodes (60): CitationCheckButton(), INITIAL_STATE, AiKeySetup(), AiKeySetupProps, ConnectForm(), CONSOLE_LINKS, GUIDE_STEPS, MODEL_HINTS (+52 more)

### Community 27 - "button.tsx"
Cohesion: 0.12
Nodes (32): CLOUDFLARE_STEPS, STEPS, INITIAL_STATE, GUIDE_STEPS, INITIAL_STATE, CONSOLE_LINKS, FAMILY_LABELS, GUIDE_STEPS (+24 more)

### Community 28 - "rules/index.ts"
Cohesion: 0.23
Nodes (15): SiteCrawl, evaluateAeoRules(), finding(), evaluateAioRules(), finding(), evaluateGeoRules(), finding(), RECOGNIZED_SCHEMA_TYPES (+7 more)

### Community 29 - "metrics.ts"
Cohesion: 0.19
Nodes (23): hasCapability(), sumTotals(), addDays(), dateSequence(), dayOfWeekOf(), daysBetween(), daysSince(), MOCK_TODAY (+15 more)

### Community 30 - "createAdminClient"
Cohesion: 0.14
Nodes (22): GET(), maxDuration, GET(), maxDuration, disconnectConnectionAction(), INITIAL_STATE, refreshAllSiteAiModelCaches(), familyOf() (+14 more)

### Community 31 - "createClient"
Cohesion: 0.12
Nodes (23): GET(), InvitePage(), CONFIRM_INITIAL_STATE, DISMISS_INITIAL_STATE, PendingGoogleConnectionRow(), InviteMemberDialog(), refreshSiteAiModelsAction(), saveSiteAiConfigAction() (+15 more)

### Community 32 - "meta-discovery.ts"
Cohesion: 0.13
Nodes (23): ConnectMetaAdsButton(), INITIAL_STATE, ERROR_MESSAGES, MetaAdsPicker(), connectMetaAdsAccount(), ConnectMetaAdsState, schema, listAvailableMetaAdsAccounts() (+15 more)

### Community 33 - "actions/prompts.ts"
Cohesion: 0.06
Nodes (58): CreateSuggestedPromptButton(), NewPromptDialog(), RatingStars(), TestRunDialog(), createPromptAction(), CreatePromptState, ratePromptRunAction(), requireUserId() (+50 more)

### Community 34 - "metrics/types.ts"
Cohesion: 0.19
Nodes (13): deriveMetrics(), MetricDirection, safeDiv(), ADDITIVE_METRICS, AdditiveMetricKey, ComparedValue, DatedRow, DerivedMetrics (+5 more)

### Community 35 - "data/connections.ts"
Cohesion: 0.16
Nodes (15): ConnectPanelProps, ConnectionRow, ConnectionSummary, toConnection(), Connection, CONNECTION_STATUS_LABELS, ConnectionError, ConnectionStatus (+7 more)

### Community 36 - "[provider]/page.tsx"
Cohesion: 0.07
Nodes (37): RFC-2616, generateMetadata(), isProductStatusFilter(), PRODUCT_STATUS_FILTERS, ProductStatusFilterParam, ChannelAvatar(), SIZE_CLASS, ChannelSwitcher() (+29 more)

### Community 37 - "Communities (114 total, 37 thin omitted)"
Cohesion: 0.03
Nodes (65): Communities (114 total, 37 thin omitted), Community 0 - "site-channel-detail.ts", Community 10 - "getSite", Community 11 - "compilerOptions", Community 12 - "dependencies", Community 13 - "devDependencies", Community 14 - "actions/google-ads.ts", Community 15 - "data/plans.ts" (+57 more)

### Community 38 - "crawler.ts"
Cohesion: 0.16
Nodes (20): GenerateLlmsTxtButton(), INITIAL_STATE, generateLlmsTxtAction(), GenerateLlmsTxtState, INITIAL_STATE, AI_BOTS, BOT_CHALLENGE_MARKERS, crawlSite() (+12 more)

### Community 39 - "new-plan-dialog.tsx"
Cohesion: 0.15
Nodes (16): CurrencyConversionHint(), formatterCache, localTimeFormatter(), LocalTimeHint(), INITIAL_STATE, buildTimeSlots(), TimePickerField(), TimePickerFieldProps (+8 more)

### Community 40 - "citability.ts"
Cohesion: 0.26
Nodes (14): AXIS_ISSUES, clamp(), computeAxes(), computePageCitability(), issuesOf(), scoreAnswerability(), scoreEntityClarity(), scoreFreshness() (+6 more)

### Community 41 - "google-ads-accounts.ts"
Cohesion: 0.18
Nodes (13): ERROR_MESSAGES, GoogleAdsPicker(), GoogleAdsAccountsResult, listAvailableGoogleAdsAccounts(), fetchCustomerDescriptiveName(), GaqlRow, GoogleAdsAccount, GoogleAdsApiError (+5 more)

### Community 42 - "delta.tsx"
Cohesion: 0.24
Nodes (9): Delta(), DeltaProps, TONE_CLASS, TONE_PILL, StatTileProps, formatDelta(), DeltaTone, METRIC_DIRECTION (+1 more)

### Community 43 - "database.types.ts"
Cohesion: 0.07
Nodes (47): AuditRunningPoller(), ConnectionsRealtime(), RealtimeRefreshOptions, useRealtimeRefresh(), discoverYoutubeAccounts(), ContentPostSnapshot, FacebookPostItem, fetchAllFacebookPosts() (+39 more)

### Community 44 - "actions/site.ts"
Cohesion: 0.19
Nodes (10): CreateSiteForm(), createSite(), CreateSiteState, percentOrDefault, schema, thresholdsSchema, UpdateInsightThresholdsState, updateSchema (+2 more)

### Community 45 - "auth.ts"
Cohesion: 0.14
Nodes (15): metadata, metadata, NotFound(), AuthAction, AuthForm(), AuthFormProps, AuthState, credentialsSchema (+7 more)

### Community 46 - "site-insights.ts"
Cohesion: 0.20
Nodes (17): InsightsPage(), metadata, listConnections, anomalyInsight(), brokenConnectionInsight(), detectAnomalies(), getInsightActionMap(), getRealInsights() (+9 more)

### Community 47 - "klaviyo.ts"
Cohesion: 0.07
Nodes (45): FORM_STATUS_LABELS, KlaviyoAudiencePanelProps, KlaviyoDashboardProps, NameList(), PerformanceTableRow, authHeaders(), ConversionMetricOutcome, countKlaviyoProfiles() (+37 more)

### Community 48 - "20260812000001_init_auth_and_sites.sql"
Cohesion: 0.31
Nodes (7): public.has_site_role(), public.is_site_member(), public.profiles, public.site_members, public.sites, auth, auth.users

### Community 49 - "package.json"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, lint, start, version

### Community 50 - "run-agent.ts"
Cohesion: 0.18
Nodes (18): AdminClient, defaultRange(), fetchAgentRow(), fetchPromptRow(), fetchPromptVersionRow(), fetchSiteRow(), runAgent(), RunAgentRow (+10 more)

### Community 51 - "feedback.tsx"
Cohesion: 0.08
Nodes (5): CALLOUT_CLASS, CalloutProps, CalloutTone, EmptyStateProps, PageSkeleton()

### Community 52 - "report-builder.tsx"
Cohesion: 0.08
Nodes (40): SpendChart(), ALL_METRIC_KEYS, formatDurationHours(), formatDurationSec(), Ga4OverviewPanel(), TileConfig, TILES, buildExploreRows() (+32 more)

### Community 53 - "mobile-nav-drawer.tsx"
Cohesion: 0.43
Nodes (6): useMobileNav(), MobileNavDrawer(), buildNavSections(), isNavItemActive(), NavItem, NavSection

### Community 54 - "date-picker-field.tsx"
Cohesion: 0.24
Nodes (10): CalendarView, captionButtonClass, DatePickerField(), DatePickerFieldProps, dayButtonClass, decadeBuckets(), fromIsoDate(), gridButtonClass (+2 more)

### Community 55 - "20260813000008_planner.sql"
Cohesion: 0.43
Nodes (5): public.deployments, public.plan_items, public.plans, auth.users, public.sites

### Community 56 - "public.audit_runs"
Cohesion: 0.33
Nodes (5): public, public.audit_runs, auth, auth.users, public.sites

### Community 57 - "20260812000004_app_settings.sql"
Cohesion: 0.33
Nodes (4): public.prevent_platform_admin_self_grant, profiles_guard_platform_admin, public.app_settings, auth.users

### Community 58 - "google-explore.ts"
Cohesion: 0.09
Nodes (41): fetchGa4MetricBreakdownAction(), Ga4MetricBreakdownState, schema, authHeader(), chunk(), chunkIds(), daysAgo(), fetchGa4MetricBreakdown() (+33 more)

### Community 59 - "formatCompact"
Cohesion: 0.14
Nodes (26): VideoCardGrid(), MetaPostDetailDialog(), MetaPostItem, MetaPostList(), MetaRankingList(), TiktokDashboard(), TiktokVideoCard(), TiktokVideoCardData (+18 more)

### Community 60 - "public.connections"
Cohesion: 0.50
Nodes (4): public.connection_secrets, public.connections, auth.users, public.sites

### Community 61 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 63 - "proxy.ts"
Cohesion: 0.42
Nodes (8): formatLastSiteCookie(), isUuid(), LAST_SITE_COOKIE_MAX_AGE, parseLastSiteCookie(), parseSiteIdFromPath(), config, proxy(), PUBLIC_PREFIXES

### Community 64 - "public.site_oauth_apps"
Cohesion: 0.50
Nodes (3): public.site_oauth_apps, auth.users, public.sites

### Community 65 - "public.tracked_prompts"
Cohesion: 0.50
Nodes (3): public.tracked_prompts, auth.users, public.sites

### Community 70 - "site-channels.ts"
Cohesion: 0.12
Nodes (32): MetaFollowerTarget, AGENT_SUMMARY_EMPTY_TOTALS, agentSummarySnapshotUpperBound(), agentSummaryToIsoDate(), aggregateByCampaign(), CampaignPerformance, getCampaignPerformance(), getChannelSummariesForAgent() (+24 more)

### Community 72 - "meta-trending-widget.tsx"
Cohesion: 0.12
Nodes (26): MetaDashboard(), MetaPostStats, toPostItem(), MetaPostMetric, buildMetaPostMetrics(), MetaStatsSummary(), MetaTrendingWidget(), TrendingRow() (+18 more)

### Community 74 - "google-merchant.ts"
Cohesion: 0.13
Nodes (20): MerchantPerformancePanelProps, MerchantCenterExplore, classifyStatus(), ContentApiDestinationStatus, ContentApiIssue, ContentApiProductStatus, ContentApiProductStatusesResponse, countMerchantCenterProducts() (+12 more)

### Community 77 - "Global Constraints"
Cohesion: 0.10
Nodes (19): Agents + Prompt Studio Implementation Plan, Global Constraints, Task 10: Wire Prompt Studio page to real data, Task 11: Agents data layer, Task 12: Agent tool registry, Task 13: Agent execution loop, Task 14: Agent server actions, Task 15: Wire Agents pages to real data (+11 more)

### Community 78 - "Prompt Studio + Agents — real data layer, LLM integration, tool-calling loop"
Cohesion: 0.10
Nodes (19): Agents, Approval queue, Data layer — `src/lib/data/agents.ts`, Data layer — `src/lib/data/prompts.ts`, Data model (new Supabase tables), Decisions locked in during brainstorming, Execution loop — `src/lib/agents/run-agent.ts`, LLM call layer — `src/lib/providers/anthropic.ts` (+11 more)

### Community 79 - "data/agents.ts"
Cohesion: 0.17
Nodes (19): AgentDetailPage(), generateMetadata(), AgentsPage(), proposeAction(), AgentRow, attachPendingActions(), createAgent(), createPendingAction() (+11 more)

### Community 80 - "agent-suggestions.ts"
Cohesion: 0.20
Nodes (16): AgentRoleSuggestions, computeAgentRoleSuggestions(), suggestAgentRoles(), VALID_ROLES, validate(), AiJsonResult, callAiForJson(), stripCodeFence() (+8 more)

### Community 83 - "vercel.json"
Cohesion: 0.40
Nodes (4): sin1, crons, regions, $schema

### Community 84 - "Architecture"
Cohesion: 0.14
Nodes (12): Architecture, Background sync, Code conventions specific to this repo, Commands, Date ranges, Design system (Hallmark — "Ink & Signal"), `lib/data/` vs `mock/`, Metrics: two shapes, two tables (+4 more)

### Community 114 - "theme-toggle.tsx"
Cohesion: 0.23
Nodes (15): Appearance, APPEARANCE_ICON, getAppearance(), getServerAppearance(), getServerMode(), MODE_ICON, subscribeToAppearance(), ThemeToggle() (+7 more)

### Community 115 - "Global Constraints"
Cohesion: 0.12
Nodes (15): Global Constraints, Multi-provider AI Keys Implementation Plan, Task 10: Rewire the Settings UI to the multi-provider flow, Task 11: Wire Prompt Studio to `callAi`, Task 12: Wire Agents to `callAi` and clean up now-dead legacy exports, Task 13: Full verification pass, Task 1: Migrate `site_ai_keys` to single-row-per-site + add `model` column, Task 2: Update generated types for `site_ai_keys` (+7 more)

### Community 116 - "Facebook + Instagram channel pages: Tổng quan / Dashboard tabs"
Cohesion: 0.12
Nodes (15): Dashboard tab, Data model, Detail dialog, Engagement score, not views, Explicitly out of scope, Facebook + Instagram channel pages: Tổng quan / Dashboard tabs, Grid (Tổng quan tab), New table: `content_metrics_daily` (+7 more)

### Community 117 - "sites.ts"
Cohesion: 0.26
Nodes (11): SiteLayout(), RootPage(), MobileNavContext, MobileNavContextValue, MobileNavProvider(), getCurrentProfile(), listSites(), setLastSiteId() (+3 more)

### Community 118 - "settings/page.tsx"
Cohesion: 0.21
Nodes (12): metadata, ROLE_LABELS, SettingsPage(), InviteMemberDialogProps, InvitePreview, getLatestAuditPageSignals(), getSiteAiConnection(), getInviteLink() (+4 more)

### Community 119 - "Global Constraints"
Cohesion: 0.14
Nodes (13): Global Constraints, Task 10: Wire tabs into `ChannelDetailBody`'s TikTok case, Task 11: Full verification pass, Task 1: Add `createdAt` and `shareUrl` to `TiktokExplore.topVideos`, Task 2: Build the `UrlTabs` primitive, Task 3: Build `TiktokChannelHeader` and wire it into the channel page, Task 4: Build the dense video grid (`TiktokVideoGrid` + `TiktokVideoCard`, no click yet), Task 5: Add the click-through video detail dialog (+5 more)

### Community 120 - "Global Constraints"
Cohesion: 0.14
Nodes (13): AI Model List + Cron Refresh Implementation Plan, Global Constraints, Task 10: Build a searchable combobox and wire it into the Settings UI, Task 11: Full verification pass, Task 1: Migrate `site_ai_keys` — add model-cache columns, Task 2: Update generated types, Task 3: Anthropic — list available models, Task 4: OpenAI — list available models (+5 more)

### Community 121 - "actions/agents.ts"
Cohesion: 0.29
Nodes (12): ApprovalActions(), Decision, approvePendingActionAction(), createAgentAction(), CreateAgentState, rejectPendingActionAction(), requireUserId(), runAgentNowAction() (+4 more)

### Community 122 - "actions/tracked-prompts.ts"
Cohesion: 0.18
Nodes (12): AddSuggestedPromptButton(), INITIAL_STATE, AddTrackedPromptDialog(), createSchema, createTrackedPromptAction(), deleteSchema, deleteTrackedPromptAction(), INITIAL_STATE (+4 more)

### Community 123 - "Facebook/Instagram channel pages: Tổng quan / Dashboard tabs"
Cohesion: 0.15
Nodes (12): Data flow summary, Error handling, Facebook/Instagram channel pages: Tổng quan / Dashboard tabs, Header, Out of scope, Problem, Provider adapter changes (`src/lib/providers/meta-explore.ts`), Scope and phasing (+4 more)

### Community 124 - "TikTok channel page: Tổng quan / Dashboard tabs"
Cohesion: 0.15
Nodes (12): Data flow summary, Error handling, Header redesign, Out of scope, Problem, Scope, Tab 1: Tổng quan (Overview), Tab 2: Dashboard (+4 more)

### Community 125 - "meta-metrics.ts"
Cohesion: 0.18
Nodes (12): authHeader(), CONVERSION_ACTION_TYPES, InstagramInsightMetric, InstagramInsightValue, instagramMetricsAdapter, MetaActionValue, MetaAdsCampaignMetricRow, metaAdsMetricsAdapter (+4 more)

### Community 126 - "Ghi nhớ site đã chọn gần nhất"
Cohesion: 0.17
Nodes (11): Edge case, Ghi — mỗi khi vào một site, Ghi nhớ site đã chọn gần nhất, Không đổi, Lưu trữ, Phạm vi, `src/lib/data/sites.ts`, Testing (+3 more)

### Community 127 - "app/layout.tsx"
Cohesion: 0.20
Nodes (8): body, display, metadata, viewport, SidebarScript(), ThemeScript(), SIDEBAR_STORAGE_KEY, THEME_STORAGE_KEY

### Community 128 - "new-agent-dialog.tsx"
Cohesion: 0.17
Nodes (11): EMPTY_TOOL_SELECTION, READ_TOOL_NAMES, ToolChoice, ToolRow(), ToolSelection, WRITE_TOOL_NAMES, AgentSuggestion, AgentRole (+3 more)

### Community 129 - "market-detection.ts"
Cohesion: 0.26
Nodes (10): applyDetectedMarketOnce(), COMPOUND_SUFFIXES, detectMarket(), dominantLanguage(), extractTld(), findCountryCode(), LANG_MARKET, MarketDetection (+2 more)

### Community 130 - "google-metrics.ts"
Cohesion: 0.17
Nodes (8): ga4MetricsAdapter, Ga4ReportRow, gscMetricsAdapter, GscReportRow, METRICS_ADAPTERS, youtubeMetricsAdapter, YoutubeReportResponse, ZERO_ROW

### Community 131 - "Global Constraints"
Cohesion: 0.18
Nodes (10): Global Constraints, Task 1: Migration — `video_metrics_daily` table, Task 2: TikTok provider — paginated video fetch for snapshotting, Task 3: Sync layer — write daily video snapshots, Task 4: Shared trending types, Task 5: TikTok read layer, Task 6: YouTube read layer, Task 7: Wire trending into channel-detail data layer (+2 more)

### Community 132 - "run-agents/route.ts"
Cohesion: 0.35
Nodes (8): GET(), maxDuration, AgentSchedule, alreadyRanThisWindow(), isAgentDue(), localDayNumber(), SiteLocalParts, WEEKDAY_INDEX

### Community 133 - "stats-donut.tsx"
Cohesion: 0.42
Nodes (6): StatsDonut, resolveCssColorToRgba(), StatsDonutProps, STATS_DONUT_COLOR_TOKENS, StatsDonutSlice, useResolvedDonutColors()

### Community 134 - "pagespeed.ts"
Cohesion: 0.24
Nodes (10): attemptPageSpeedStrategy(), fetchPageSpeedStrategy(), OPPORTUNITY_AUDIT_IDS, PsiAudit, PsiCategory, PsiResponse, PsiStrategyOutcome, toScore() (+2 more)

### Community 135 - "tiktok.ts"
Cohesion: 0.20
Nodes (10): requestToken(), SCOPES, tiktokAdapter, TiktokAllVideosOutcome, TiktokTokenResponse, TiktokUserInfoData, TiktokVideoItem, TiktokVideoSnapshot (+2 more)

### Community 136 - "Multi-provider AI keys — design"
Cohesion: 0.20
Nodes (9): 1. Data model, 2. Provider abstraction, 3. Settings UI, 4. Wiring into Prompt Studio + Agents, Context, Multi-provider AI keys — design, Non-goals, Open follow-ups (explicitly out of scope for this spec) (+1 more)

### Community 137 - "Graph Report - Marketing-Optimizer  (2026-08-13)"
Cohesion: 0.20
Nodes (9): Community Hubs (Navigation), Corpus Check, God Nodes (most connected - your core abstractions), Graph Report - Marketing-Optimizer  (2026-08-13), Import Cycles, Knowledge Gaps, Suggested Questions, Summary (+1 more)

### Community 138 - "legal-page-shell.tsx"
Cohesion: 0.33
Nodes (5): metadata, metadata, LegalList(), LegalPageShell(), LegalSection()

### Community 139 - "mock/agents.ts"
Cohesion: 0.24
Nodes (7): AgentRun, findAgent(), MOCK_AGENTS, MOCK_PENDING_ACTIONS, MOCK_RUNS, pendingActionsOfSite(), runsOfSite()

### Community 140 - "Global Constraints"
Cohesion: 0.22
Nodes (8): Facebook/Instagram Channel Tabs (Phase 1) Implementation Plan, Global Constraints, Task 1: Extend `meta-explore.ts` with `createdAt`, `permalinkUrl`, `thumbnailUrl`, `fetchError`, Task 2: Build `MetaPostList` + `MetaPostDetailDialog`, Task 3: Build `MetaChannelHeader` and wire it into the channel page, Task 4: Build `MetaStatsSummary`, Task 5: Wire tabs into `ChannelDetailBody`'s Facebook and Instagram cases, Task 6: Full verification pass

### Community 141 - "Video metrics snapshot pipeline (TikTok + YouTube trending/top-all-time)"
Cohesion: 0.22
Nodes (8): Defaults (adjustable later without schema/interface changes), Key constraint driving the design, Out of scope / explicitly not doing, Problem, Read layer — shared shape for TikTok and YouTube, Schema, Sync, Video metrics snapshot pipeline (TikTok + YouTube trending/top-all-time)

### Community 142 - "AEO audit category — design"
Cohesion: 0.22
Nodes (8): AEO audit category — design, AEO rule set (`src/lib/audit/rules/aeo.ts`), Context, Data model, Decision, Out of scope (deferred to a follow-up spec), Touch points, Verification

### Community 143 - "Real LLM citation checking + topic-based question suggestions — design"
Cohesion: 0.22
Nodes (8): Context, Data model changes, Explicitly out of scope (this pass), Part A — Citation checking, Part B — Topic-based question/keyword suggestions, Real LLM citation checking + topic-based question suggestions — design, Touch points, Verification

### Community 144 - "sync.ts"
Cohesion: 0.31
Nodes (7): INITIAL_STATE, RefreshConnectionButton(), INITIAL_STATE, ResyncState, SYNC_CONNECTION_INITIAL_STATE, syncConnectionAction(), SyncConnectionState

### Community 145 - "side-rail.tsx"
Cohesion: 0.50
Nodes (7): SideRail(), SideRailProps, applySidebarCollapsed(), getServerSidebarCollapsed(), readStoredSidebarCollapsed(), storeSidebarCollapsed(), subscribeSidebarCollapsed()

### Community 146 - "public.get_video_trending_snapshots"
Cohesion: 0.25
Nodes (8): public.get_video_range_snapshots(), public.get_video_trending_snapshots(), baseline_row, cutoff_rows, earliest, end_row, latest, public.video_metrics_daily

### Community 147 - "Global Constraints"
Cohesion: 0.25
Nodes (7): Global Constraints, Remember Last-Selected Site Implementation Plan, Task 1: Migration — add `profiles.last_site_id`, Task 2: Data layer — read/write `last_site_id`, Task 3: Root entry — redirect to last-selected site, Task 4: Site layout — persist site on view, Task 5: Full verification pass

### Community 148 - "public.agent_runs"
Cohesion: 0.43
Nodes (6): public.prompts, public.agent_runs, public.agents, public.pending_actions, auth.users, public.sites

### Community 149 - "data-gate.tsx"
Cohesion: 0.38
Nodes (5): DataGate(), DataGateProps, LockedPreview(), LockedPreviewProps, getConnectionSummary()

### Community 150 - "google.ts"
Cohesion: 0.29
Nodes (5): GOOGLE_ADS_SCOPE, GOOGLE_MERCHANT_SCOPE, googleAdapter, GoogleTokenResponse, SCOPES

### Community 151 - "public.get_video_range_growth"
Cohesion: 0.33
Nodes (5): before_range, first_in_range, last_in_range, public.get_video_range_growth(), public.video_metrics_daily

### Community 152 - "public.get_video_trending_snapshots"
Cohesion: 0.33
Nodes (5): public.get_video_trending_snapshots(), cutoff_rows, earliest, latest, public.video_metrics_daily

### Community 153 - "public.get_video_trending_snapshots"
Cohesion: 0.33
Nodes (5): public.get_video_trending_snapshots(), cutoff_rows, earliest, latest, public.video_metrics_daily

### Community 154 - "public.get_content_trending_snapshots"
Cohesion: 0.33
Nodes (5): public.get_content_trending_snapshots(), cutoff_rows, earliest, latest, public.content_metrics_daily

### Community 155 - "public.get_content_trending_snapshots"
Cohesion: 0.33
Nodes (5): public.get_content_trending_snapshots(), cutoff_rows, earliest, latest, public.content_metrics_daily

### Community 156 - "public.prompt_runs"
Cohesion: 0.60
Nodes (5): public.prompt_runs, public.prompt_versions, public.prompts, auth.users, public.sites

### Community 157 - "public.get_video_range_snapshots"
Cohesion: 0.40
Nodes (4): public.get_video_range_snapshots(), baseline_row, end_row, public.video_metrics_daily

### Community 158 - "public.get_video_range_snapshots"
Cohesion: 0.40
Nodes (4): public.get_video_range_snapshots(), baseline_row, end_row, public.video_metrics_daily

### Community 159 - "public.backfill_media_targets"
Cohesion: 0.50
Nodes (3): content_metrics_daily, public.backfill_media_targets(), video_metrics_daily

### Community 161 - "public.site_ai_keys"
Cohesion: 0.50
Nodes (3): public.site_ai_keys, auth.users, public.sites

### Community 162 - "public.pending_google_connections"
Cohesion: 0.50
Nodes (3): public.pending_google_connections, auth.users, public.sites

### Community 163 - "public.insight_actions"
Cohesion: 0.50
Nodes (3): public.insight_actions, auth.users, public.sites

### Community 164 - "public.site_invite_links"
Cohesion: 0.50
Nodes (3): public.site_invite_links, auth.users, public.sites

## Knowledge Gaps
- **760 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+755 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **58 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `site-channel-detail.ts`, `topbar.tsx`, `domain/geo.ts`, `overview/page.tsx`, `providers.ts`, `getSite`, `actions/google-ads.ts`, `data/plans.ts`, `sync.ts`, `ai-visibility/page.tsx`, `ProviderId`, `domain/audit.ts`, `actions/audit.ts`, `edit-site-form.tsx`, `actions/plans.ts`, `ai-key-setup.tsx`, `button.tsx`, `createAdminClient`, `meta-discovery.ts`, `actions/prompts.ts`, `data/connections.ts`, `[provider]/page.tsx`, `crawler.ts`, `google-ads-accounts.ts`, `actions/site.ts`, `auth.ts`, `site-insights.ts`, `google-explore.ts`, `site-channels.ts`, `meta-trending-widget.tsx`, `data/agents.ts`, `sites.ts`, `settings/page.tsx`, `actions/agents.ts`, `actions/tracked-prompts.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `createAdminClient()` connect `createAdminClient` to `meta-discovery.ts`, `market-detection.ts`, `site-channel-detail.ts`, `run-agents/route.ts`, `google-explore.ts`, `site-channels.ts`, `providers.ts`, `google-ads-accounts.ts`, `database.types.ts`, `actions/google-ads.ts`, `data/agents.ts`, `connections/page.tsx`, `run-agent.ts`, `domain/audit.ts`, `settings/page.tsx`, `actions/audit.ts`, `ai-key-setup.tsx`, `createClient`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `new-agent-dialog.tsx`, `topbar.tsx`, `channel-detail-body.tsx`, `overview/page.tsx`, `getSite`, `data/plans.ts`, `connections/page.tsx`, `side-rail.tsx`, `ai-visibility/page.tsx`, `data-gate.tsx`, `pagespeed-report.tsx`, `ai-key-setup.tsx`, `button.tsx`, `[provider]/page.tsx`, `new-plan-dialog.tsx`, `delta.tsx`, `actions/site.ts`, `feedback.tsx`, `report-builder.tsx`, `mobile-nav-drawer.tsx`, `date-picker-field.tsx`, `formatCompact`, `theme-toggle.tsx`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _760 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `site-channel-detail.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09393939393939393 - nodes in this community are weakly interconnected._
- **Should `topbar.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `domain/geo.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10837438423645321 - nodes in this community are weakly interconnected._