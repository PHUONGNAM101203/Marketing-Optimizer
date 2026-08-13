# Graph Report - Marketing-Optimizer  (2026-08-13)

## Corpus Check
- 221 files · ~103,749 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1320 nodes · 3404 edges · 114 communities (77 shown, 37 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- site-channel-detail.ts
- providers/index.ts
- topbar.tsx
- domain/geo.ts
- google-discovery.ts
- agents/page.tsx
- channel-detail-body.tsx
- planner/page.tsx
- providers.ts
- createAdminClient
- getSite
- compilerOptions
- dependencies
- devDependencies
- actions/google-ads.ts
- data/plans.ts
- connections/page.tsx
- cn
- entities.ts
- audit/page.tsx
- insights/page.tsx
- domain/audit.ts
- actions/audit.ts
- edit-site-form.tsx
- pagespeed-report.tsx
- actions/plans.ts
- overview/page.tsx
- oauth-app-setup.tsx
- rules/index.ts
- metrics.ts
- admin.ts
- createClient
- meta-ads.ts
- prompt.ts
- metrics/types.ts
- data/connections.ts
- button.tsx
- add-plan-item-dialog.tsx
- crawler.ts
- live-hints.tsx
- citability.ts
- card.tsx
- delta.tsx
- database.types.ts
- PROVIDER_META
- auth-form.tsx
- site-insights.ts
- dates.ts
- 20260812000001_init_auth_and_sites.sql
- package.json
- ProviderId
- feedback.tsx
- actions/llms-txt.ts
- side-rail.tsx
- date-picker-field.tsx
- 20260813000008_planner.sql
- public.audit_runs
- 20260812000004_app_settings.sql
- channel-trend-card.tsx
- mock/connections.ts
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
- class-variance-authority
- eslint.config.mjs
- fast-xml-parser
- next.config.ts
- radix-ui
- tailwind-merge
- zod
- @playwright/test
- tailwindcss
- @types/react
- typescript
- vitest
- postcss.config.mjs
- vercel.json
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

## God Nodes (most connected - your core abstractions)
1. `cn()` - 78 edges
2. `createClient()` - 71 edges
3. `ProviderId` - 51 edges
4. `createAdminClient()` - 42 edges
5. `getSite()` - 41 edges
6. `Button` - 38 edges
7. `formatNumber()` - 25 edges
8. `Card()` - 23 edges
9. `formatRelativeTime()` - 22 edges
10. `Badge()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `ConnectionCard()` --calls--> `formatRelativeTime()`  [EXTRACTED]
  src/app/(app)/[siteId]/connections/page.tsx → src/lib/format.ts
- `OnboardingPage()` --calls--> `cn()`  [EXTRACTED]
  src/app/onboarding/page.tsx → src/lib/cn.ts
- `SiteSwitcher()` --calls--> `cn()`  [EXTRACTED]
  src/components/layout/topbar.tsx → src/lib/cn.ts
- `DateRangeMenu()` --calls--> `cn()`  [EXTRACTED]
  src/components/layout/topbar.tsx → src/lib/cn.ts
- `EditPlanPeriodDialog()` --indirect_call--> `updatePlanPeriodAction()`  [INFERRED]
  src/components/planner/edit-plan-period-dialog.tsx → src/lib/actions/plans.ts

## Import Cycles
- None detected.

## Communities (114 total, 37 thin omitted)

### Community 0 - "site-channel-detail.ts"
Cohesion: 0.05
Nodes (69): ChannelDetailPage(), generateMetadata(), isProductStatusFilter(), PRODUCT_STATUS_FILTERS, ProductStatusFilterParam, SpendChart(), ReportRow, CampaignExplore (+61 more)

### Community 1 - "providers/index.ts"
Cohesion: 0.05
Nodes (41): FacebookInsightMetric, FacebookInsightValue, facebookMetricsAdapter, ZERO_ROW, fetchCustomerDescriptiveName(), fetchGoogleAdsCampaignMetrics(), GaqlRow, GoogleAdsAccount (+33 more)

### Community 2 - "topbar.tsx"
Cohesion: 0.07
Nodes (40): body, display, metadata, ThemeScript(), Appearance, APPEARANCE_ICON, getAppearance(), getServerAppearance() (+32 more)

### Community 3 - "domain/geo.ts"
Cohesion: 0.07
Nodes (37): AddSuggestedPromptButton(), INITIAL_STATE, AddTrackedPromptDialog(), TrackedPromptCard(), createSchema, createTrackedPromptAction(), deleteSchema, deleteTrackedPromptAction() (+29 more)

### Community 4 - "google-discovery.ts"
Cohesion: 0.08
Nodes (39): EditSiteForm(), CreateSiteState, schema, updateSchema, updateSite(), UpdateSiteState, urlSchema, normalizeHostname() (+31 more)

### Community 5 - "agents/page.tsx"
Cohesion: 0.11
Nodes (33): AgentDetailPage(), generateMetadata(), RUN_TONE, STEP_LABELS, AgentCard(), AgentsPage(), metadata, RUN_TONE (+25 more)

### Community 6 - "channel-detail-body.tsx"
Cohesion: 0.12
Nodes (27): formatEvidenceValue(), InsightCard(), BreakdownTable(), ChannelHeadline(), ChannelDetailBody(), MerchantStat(), PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONE (+19 more)

### Community 7 - "planner/page.tsx"
Cohesion: 0.11
Nodes (29): metadata, metadata, PlannerPage(), PlanSection(), COLUMNS, DEFAULT_METRICS, Formatter, MetricColumn (+21 more)

### Community 8 - "providers.ts"
Cohesion: 0.08
Nodes (20): OAUTH_STATE_COOKIE, OAuthAppSetupProps, PROVIDER_FAMILY_IDS, ProviderCapability, ProviderCategory, ProviderFamily, ProviderFamilyMeta, ProviderMeta (+12 more)

### Community 9 - "createAdminClient"
Cohesion: 0.17
Nodes (24): GET(), ConnectionsPage(), OAuthAppSetup(), SaveOAuthAppState, saveSiteOAuthApp(), schema, decrypt(), encrypt() (+16 more)

### Community 10 - "getSite"
Cohesion: 0.14
Nodes (22): metadata, ExplorePage(), metadata, metadata, PromptsPage(), metadata, ROLE_LABELS, SettingsPage() (+14 more)

### Community 11 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 12 - "dependencies"
Cohesion: 0.08
Nodes (25): cheerio, clsx, date-fns, lucide-react, next, dependencies, cheerio, clsx (+17 more)

### Community 13 - "devDependencies"
Cohesion: 0.08
Nodes (25): eslint, eslint-config-next, jsdom, msw, devDependencies, eslint, eslint-config-next, jsdom (+17 more)

### Community 14 - "actions/google-ads.ts"
Cohesion: 0.15
Nodes (17): ConnectGoogleAdsButton(), INITIAL_STATE, ConnectGtmButton(), INITIAL_STATE, GtmPicker(), connectGoogleAdsAccount(), ConnectGoogleAdsState, schema (+9 more)

### Community 15 - "data/plans.ts"
Cohesion: 0.13
Nodes (21): DeploymentStatusSelect(), PlanStatusSelect(), selectClass, DeploymentRow, listDeployments(), PlanItemRow, PlanRow, toDeployment() (+13 more)

### Community 16 - "connections/page.tsx"
Cohesion: 0.15
Nodes (16): ConnectionCard(), metadata, OAUTH_ERROR_LABELS, STATUS_TONE, ADAPTER_READY_FAMILIES, ConnectPanel(), PROVIDER_ICON, ProviderMark() (+8 more)

### Community 17 - "cn"
Cohesion: 0.15
Nodes (16): Mark(), MarkProps, SIZE_CLASS, Wordmark(), WordmarkProps, SiteFavicon(), SiteFaviconProps, InlineLocked() (+8 more)

### Community 18 - "entities.ts"
Cohesion: 0.15
Nodes (17): Entity, ENTITY_KIND_LABELS, ENTITY_STATUS_LABELS, EntityKind, EntityStatus, PRIMARY_ENTITY_KIND, EntityPerformance, averagePositionOf() (+9 more)

### Community 19 - "audit/page.tsx"
Cohesion: 0.14
Nodes (18): RunDetail(), RunRow(), AiVisibilityPage(), AuditPage(), metadata, ChannelsPage(), PromptCard(), AuditRunningPoller() (+10 more)

### Community 20 - "insights/page.tsx"
Cohesion: 0.14
Nodes (17): InsightsPage(), metadata, SEVERITY_TONE, ACTION_KIND_LABELS, bySeverity(), hasValidEvidence(), Insight, InsightEvidence (+9 more)

### Community 21 - "domain/audit.ts"
Cohesion: 0.13
Nodes (18): AuditCategoryPanel(), scoreColorVar, scoreTone(), STATUS_ICON, STATUS_ORDER, STATUS_TONE, AgentSuggestion, suggestAgentRoles() (+10 more)

### Community 22 - "actions/audit.ts"
Cohesion: 0.18
Nodes (17): INITIAL_STATE, RunAuditButton(), INITIAL_STATE, performAuditScan(), RunAuditState, runSiteAuditAction(), applyDetectedMarketOnce(), realPagesOf() (+9 more)

### Community 23 - "edit-site-form.tsx"
Cohesion: 0.14
Nodes (17): CURRENCY_OPTIONS, TIMEZONE_OPTIONS, COMPOUND_SUFFIXES, COUNTRY_OPTIONS, detectMarket(), dominantLanguage(), extractTld(), findCountryCode() (+9 more)

### Community 24 - "pagespeed-report.tsx"
Cohesion: 0.12
Nodes (15): ScoreGauge(), STRATEGY_ICON, STRATEGY_LABEL, Tone, TONE_COLOR, TONE_LABEL, toneOfScore(), fetchPageSpeedStrategy() (+7 more)

### Community 25 - "actions/plans.ts"
Cohesion: 0.13
Nodes (16): INITIAL_STATE, NewPlanDialog(), createPlanAction(), createPlanItemSchema, createPlanSchema, deletePlanItemAction(), deletePlanItemSchema, INITIAL_STATE (+8 more)

### Community 26 - "overview/page.tsx"
Cohesion: 0.15
Nodes (14): familyMembers(), metadata, OverviewPage(), SPEND_PROVIDERS, SiteProfileCard(), ChannelTrendCard(), SeriesCell(), EMPTY_SUMMARY (+6 more)

### Community 27 - "oauth-app-setup.tsx"
Cohesion: 0.19
Nodes (12): BotProtectionGuide(), CLOUDFLARE_STEPS, AdsDeveloperTokenGuide(), STEPS, CONSOLE_LINKS, FAMILY_LABELS, GUIDE_STEPS, INITIAL_STATE (+4 more)

### Community 28 - "rules/index.ts"
Cohesion: 0.24
Nodes (13): SiteCrawl, evaluateAioRules(), finding(), evaluateGeoRules(), finding(), RECOGNIZED_SCHEMA_TYPES, AuditScores, evaluateAllRules() (+5 more)

### Community 29 - "metrics.ts"
Cohesion: 0.22
Nodes (17): hasCapability(), sumTotals(), MetricTotals, TimeSeriesPoint, unitsToMicros(), dayOfWeekOf(), daysSince(), buildFullSeries() (+9 more)

### Community 30 - "admin.ts"
Cohesion: 0.19
Nodes (13): GET(), maxDuration, METRICS_ADAPTERS, cronEnv(), cronSchema, cryptoSchema, publicEnv(), publicSchema (+5 more)

### Community 31 - "createClient"
Cohesion: 0.22
Nodes (13): GET(), GET(), RootPage(), credentialsSchema, firstIssue(), safeNext(), signIn(), signOut() (+5 more)

### Community 32 - "meta-ads.ts"
Cohesion: 0.22
Nodes (11): ConnectMetaAdsButton(), INITIAL_STATE, ERROR_MESSAGES, MetaAdsPicker(), connectMetaAdsAccount(), ConnectMetaAdsState, schema, listAvailableMetaAdsAccounts() (+3 more)

### Community 33 - "prompt.ts"
Cohesion: 0.16
Nodes (13): extractVariableNames(), findUndeclaredVariables(), PROMPT_CATEGORY_LABELS, PromptCategory, PromptRun, PromptTemplate, PromptVariable, PromptVariableSource (+5 more)

### Community 34 - "metrics/types.ts"
Cohesion: 0.17
Nodes (13): deriveMetrics(), MetricDirection, safeDiv(), ADDITIVE_METRICS, AdditiveMetricKey, ChannelBreakdown, ComparedValue, DatedRow (+5 more)

### Community 35 - "data/connections.ts"
Cohesion: 0.22
Nodes (12): SiteLayout(), ConnectionRow, getConnectionSummary(), listConnections(), toConnection(), getCurrentProfile(), CONNECTION_STATUS_LABELS, ConnectionError (+4 more)

### Community 36 - "button.tsx"
Cohesion: 0.19
Nodes (10): ExternalChannelLink(), LlmsTxtPreview(), Button, ButtonProps, ButtonState, buttonVariants, STATE_ICON, Pagination() (+2 more)

### Community 37 - "add-plan-item-dialog.tsx"
Cohesion: 0.22
Nodes (11): INITIAL_STATE, AddPlanItemDialog(), INITIAL_STATE, KPI_UNIT_LABELS, FormField(), FormFieldProps, inputClass, buildTimeSlots() (+3 more)

### Community 38 - "crawler.ts"
Cohesion: 0.26
Nodes (14): AI_BOTS, BOT_CHALLENGE_MARKERS, crawlSite(), fetchAndParseXml(), fetchRobots(), fetchSitemapUrls(), fetchWithTimeout(), isBotChallengePage() (+6 more)

### Community 39 - "live-hints.tsx"
Cohesion: 0.23
Nodes (11): CurrencyConversionHint(), formatterCache, localTimeFormatter(), LocalTimeHint(), convertCurrencyAction(), convertCurrency(), FALLBACK_ENDPOINT(), FallbackResponse (+3 more)

### Community 40 - "citability.ts"
Cohesion: 0.29
Nodes (13): AXIS_ISSUES, clamp(), computeAxes(), computePageCitability(), issuesOf(), scoreAnswerability(), scoreEntityClarity(), scoreFreshness() (+5 more)

### Community 41 - "card.tsx"
Cohesion: 0.18
Nodes (10): CONFIDENCE_LABELS, ERROR_MESSAGES, GoogleAdsPicker(), Card(), CardFooter(), CardHeaderProps, CardProps, CardTone (+2 more)

### Community 42 - "delta.tsx"
Cohesion: 0.22
Nodes (11): Delta(), DeltaProps, TONE_CLASS, TONE_PILL, StatRow(), StatTile(), StatTileProps, formatDelta() (+3 more)

### Community 43 - "database.types.ts"
Cohesion: 0.17
Nodes (10): CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema, Enums, Json, Tables (+2 more)

### Community 44 - "PROVIDER_META"
Cohesion: 0.24
Nodes (6): metadata, OnboardingPage(), CreateSiteForm(), createSite(), PROVIDER_META, PROVIDERS

### Community 45 - "auth-form.tsx"
Cohesion: 0.22
Nodes (6): metadata, metadata, AuthAction, AuthForm(), AuthFormProps, AuthState

### Community 46 - "site-insights.ts"
Cohesion: 0.31
Nodes (10): anomalyInsight(), brokenConnectionInsight(), detectAnomalies(), getRealInsights(), hoursSince(), MIN_BASELINE, PRIMARY_METRIC, PrimaryMetricDef (+2 more)

### Community 47 - "dates.ts"
Cohesion: 0.33
Nodes (10): CitationCheck, ResolvedDateRange, IsoDate, addDays(), dateSequence(), daysBetween(), MOCK_TODAY, PRESET_LENGTHS (+2 more)

### Community 48 - "20260812000001_init_auth_and_sites.sql"
Cohesion: 0.31
Nodes (7): public.has_site_role(), public.is_site_member(), public.profiles, public.site_members, public.sites, auth, auth.users

### Community 49 - "package.json"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, lint, start, version

### Community 50 - "ProviderId"
Cohesion: 0.28
Nodes (9): ConnectPanelProps, ProviderMarkProps, ConnectionSummary, GoogleSourceConnection, ChannelSummary, AgentTool, Connection, Deployment (+1 more)

### Community 51 - "feedback.tsx"
Cohesion: 0.29
Nodes (5): CALLOUT_CLASS, CalloutProps, CalloutTone, EmptyStateProps, Skeleton()

### Community 52 - "actions/llms-txt.ts"
Cohesion: 0.39
Nodes (6): GenerateLlmsTxtButton(), INITIAL_STATE, generateLlmsTxtAction(), GenerateLlmsTxtState, INITIAL_STATE, generateLlmsTxtContent()

### Community 53 - "side-rail.tsx"
Cohesion: 0.39
Nodes (6): SideRail(), SideRailProps, buildNavSections(), isNavItemActive(), NavItem, NavSection

### Community 54 - "date-picker-field.tsx"
Cohesion: 0.38
Nodes (6): DatePickerField(), DatePickerFieldProps, dayButtonClass, fromIsoDate(), navButtonClass, toIsoDate()

### Community 55 - "20260813000008_planner.sql"
Cohesion: 0.43
Nodes (5): public.deployments, public.plan_items, public.plans, auth.users, public.sites

### Community 56 - "public.audit_runs"
Cohesion: 0.33
Nodes (5): public, public.audit_runs, auth, auth.users, public.sites

### Community 57 - "20260812000004_app_settings.sql"
Cohesion: 0.33
Nodes (4): public.prevent_platform_admin_self_grant, profiles_guard_platform_admin, public.app_settings, auth.users

### Community 59 - "mock/connections.ts"
Cohesion: 0.47
Nodes (5): connectionOfProvider(), connectionsOfSite(), lastSyncOfSite(), MOCK_CONNECTIONS, UNCONNECTED_PROVIDERS

### Community 60 - "public.connections"
Cohesion: 0.50
Nodes (4): public.connection_secrets, public.connections, auth.users, public.sites

### Community 61 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 63 - "proxy.ts"
Cohesion: 0.67
Nodes (3): config, proxy(), PUBLIC_PREFIXES

### Community 64 - "public.site_oauth_apps"
Cohesion: 0.50
Nodes (3): public.site_oauth_apps, auth.users, public.sites

### Community 65 - "public.tracked_prompts"
Cohesion: 0.50
Nodes (3): public.tracked_prompts, auth.users, public.sites

## Knowledge Gaps
- **367 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+362 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `site-channel-detail.ts`, `topbar.tsx`, `domain/geo.ts`, `google-discovery.ts`, `planner/page.tsx`, `createAdminClient`, `getSite`, `actions/google-ads.ts`, `data/plans.ts`, `connections/page.tsx`, `audit/page.tsx`, `actions/audit.ts`, `actions/plans.ts`, `overview/page.tsx`, `admin.ts`, `meta-ads.ts`, `data/connections.ts`, `add-plan-item-dialog.tsx`, `card.tsx`, `PROVIDER_META`, `site-insights.ts`, `actions/llms-txt.ts`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `ProviderId` connect `ProviderId` to `site-channel-detail.ts`, `providers/index.ts`, `google-discovery.ts`, `agents/page.tsx`, `channel-detail-body.tsx`, `providers.ts`, `createAdminClient`, `actions/google-ads.ts`, `data/plans.ts`, `connections/page.tsx`, `entities.ts`, `insights/page.tsx`, `overview/page.tsx`, `metrics.ts`, `meta-ads.ts`, `metrics/types.ts`, `data/connections.ts`, `button.tsx`, `site-insights.ts`, `channel-trend-card.tsx`, `mock/connections.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `topbar.tsx`, `button.tsx`, `agents/page.tsx`, `channel-detail-body.tsx`, `planner/page.tsx`, `add-plan-item-dialog.tsx`, `card.tsx`, `getSite`, `delta.tsx`, `PROVIDER_META`, `data/plans.ts`, `connections/page.tsx`, `audit/page.tsx`, `feedback.tsx`, `side-rail.tsx`, `date-picker-field.tsx`, `pagespeed-report.tsx`, `oauth-app-setup.tsx`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _367 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `site-channel-detail.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050239234449760764 - nodes in this community are weakly interconnected._
- **Should `providers/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05454545454545454 - nodes in this community are weakly interconnected._
- **Should `topbar.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06612244897959184 - nodes in this community are weakly interconnected._