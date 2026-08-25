/**
 * Danh mục 10 nền tảng và siêu dữ liệu của chúng.
 *
 * `capabilities` là thứ điều khiển UI: mỗi trang kênh đọc capabilities để quyết
 * định hiển thị cột nào, biểu đồ nào. Nhờ vậy component không cần if-else theo
 * từng provider — thêm nền tảng mới chỉ là thêm một mục vào bảng này.
 */

export const PROVIDERS = [
  'google-ads',
  'ga4',
  'gsc',
  'gtm',
  'youtube',
  'merchant-center',
  'meta-ads',
  'instagram',
  'tiktok',
  'facebook',
  'klaviyo',
] as const

export type ProviderId = (typeof PROVIDERS)[number]

// `klaviyo` là family CỦA RIÊNG NÓ — không OAuth, không thuộc Google/YouTube/
// Meta/TikTok. Cố tình KHÔNG thêm vào `PROVIDER_FAMILIES` bên dưới (mảng đó
// chỉ phục vụ luồng OAuth `/api/oauth/[family]/...`) và KHÔNG thêm vào các
// switch 'google'|'youtube'|'meta'|'tiktok' viết tay ở overview/explore
// (`familyMembers`/`familySource` — cả hai tự khai literal union riêng,
// không tham chiếu `ProviderFamily`, nên thêm giá trị này không đụng gì tới
// chúng). Klaviyo có trang chi tiết kênh riêng, không có tab Tổng quan/Khám
// phá theo family — việc đó để lại cho một lượt sau nếu cần.
export type ProviderFamily = 'google' | 'youtube' | 'meta' | 'tiktok' | 'klaviyo'

/** Nhóm chức năng — dùng để gom thẻ ở trang Connections. */
export type ProviderCategory =
  | 'ads'
  | 'analytics'
  | 'search'
  | 'social'
  | 'tooling'
  | 'commerce'
  | 'marketing-automation'

/**
 * Khả năng của nền tảng. Quyết định UI render gì.
 * - spend: có dữ liệu chi phí quảng cáo
 * - traffic: có phiên/người dùng
 * - conversions: có chuyển đổi và giá trị chuyển đổi
 * - rankings: có vị trí/truy vấn tìm kiếm
 * - content: có thực thể nội dung (video, bài đăng)
 * - tagging: quản lý thẻ, không có số liệu chuỗi thời gian
 * - catalog: quản lý sản phẩm/trạng thái duyệt, không có số liệu chuỗi thời gian
 */
export type ProviderCapability =
  | 'spend'
  | 'traffic'
  | 'conversions'
  | 'rankings'
  | 'content'
  | 'tagging'
  | 'catalog'

export interface ProviderMeta {
  readonly id: ProviderId
  readonly label: string
  readonly shortLabel: string
  readonly family: ProviderFamily
  readonly category: ProviderCategory
  readonly capabilities: readonly ProviderCapability[]
  /**
   * Tên token màu trong design system (KHÔNG phải hex).
   * Hallmark cấm hard-code màu; biểu đồ dùng bảng màu phân loại nhất quán
   * thay vì màu thương hiệu — màu thương hiệu đặt cạnh nhau sẽ chọi nhau
   * và trượt kiểm tra tương phản.
   */
  readonly colorToken: string
}

export const PROVIDER_META: Readonly<Record<ProviderId, ProviderMeta>> = {
  'google-ads': {
    id: 'google-ads',
    label: 'Google Ads',
    shortLabel: 'Google Ads',
    family: 'google',
    category: 'ads',
    capabilities: ['spend', 'conversions', 'traffic'],
    colorToken: '--color-series-1',
  },
  ga4: {
    id: 'ga4',
    label: 'Google Analytics 4',
    shortLabel: 'GA4',
    family: 'google',
    category: 'analytics',
    capabilities: ['traffic', 'conversions'],
    colorToken: '--color-series-2',
  },
  gsc: {
    id: 'gsc',
    label: 'Google Search Console',
    shortLabel: 'Search Console',
    family: 'google',
    category: 'search',
    capabilities: ['rankings', 'traffic'],
    colorToken: '--color-series-3',
  },
  gtm: {
    id: 'gtm',
    label: 'Google Tag Manager',
    shortLabel: 'Tag Manager',
    family: 'google',
    category: 'tooling',
    capabilities: ['tagging'],
    colorToken: '--color-series-4',
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    shortLabel: 'YouTube',
    family: 'youtube',
    category: 'social',
    capabilities: ['content', 'traffic'],
    colorToken: '--color-series-5',
  },
  'merchant-center': {
    id: 'merchant-center',
    label: 'Google Merchant Center',
    shortLabel: 'Merchant Center',
    family: 'google',
    category: 'commerce',
    capabilities: ['catalog'],
    // Dùng chung slot với Tag Manager — cả hai đều KHÔNG BAO GIỜ vẽ chung
    // biểu đồ với nền tảng khác (catalog và tagging không phải chỉ số chuỗi
    // thời gian có thể so sánh chéo), nên không cần một slot categorical
    // riêng. Icon + nhãn đã đủ phân biệt trong danh sách, không cần màu.
    colorToken: '--color-series-8',
  },
  'meta-ads': {
    id: 'meta-ads',
    label: 'Facebook Ads',
    shortLabel: 'Facebook Ads',
    family: 'meta',
    category: 'ads',
    capabilities: ['spend', 'conversions', 'traffic'],
    colorToken: '--color-series-6',
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    shortLabel: 'Instagram',
    family: 'meta',
    category: 'social',
    capabilities: ['content', 'traffic'],
    colorToken: '--color-series-7',
  },
  // Đổi từ TikTok for Business (Marketing API, chi phí quảng cáo) sang TikTok
  // Login Kit + Display API (nội dung hữu cơ — video/lượt xem/thích/bình
  // luận/chia sẻ của TÀI KHOẢN đã đăng nhập) — xem `providers/tiktok.ts`.
  // Không còn `spend`/`conversions`, cùng dạng `content` với YouTube/Instagram.
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    shortLabel: 'TikTok',
    family: 'tiktok',
    category: 'social',
    capabilities: ['content', 'traffic'],
    colorToken: '--color-series-8',
  },
  facebook: {
    id: 'facebook',
    label: 'Facebook (nội dung)',
    shortLabel: 'Facebook',
    family: 'meta',
    category: 'social',
    capabilities: ['content', 'traffic'],
    colorToken: '--color-series-9',
  },
  klaviyo: {
    id: 'klaviyo',
    label: 'Klaviyo',
    shortLabel: 'Klaviyo',
    family: 'klaviyo',
    category: 'marketing-automation',
    // 'content' — campaign/flow là thực thể nội dung (giống video/bài đăng);
    // 'conversions' — revenue/conversion gắn theo từng campaign/flow là số
    // liệu cốt lõi Klaviyo báo cáo (Reporting API), không phải suy diễn.
    capabilities: ['content', 'conversions'],
    // Dùng chung slot với Instagram — chart Klaviyo (nếu có, xem
    // `klaviyo-dashboard.tsx`) không bao giờ xuất hiện CÙNG Instagram trên
    // một biểu đồ so sánh chéo, giống cách GTM/Merchant Center/TikTok đã
    // chia sẻ `--color-series-8` phía trên.
    colorToken: '--color-series-7',
  },
} as const

/**
 * Nhóm theo NHÀ CUNG CẤP, không theo nền tảng.
 *
 * Đây là điều khoản quan trọng nhất của màn hình kết nối: OAuth cấp quyền theo
 * tài khoản, không theo sản phẩm. Một lần bấm "Đăng nhập Google" là lấy được
 * cả Analytics, Search Console, Tag Manager, YouTube và Ads. Bày ra tám nút
 * riêng lẻ vừa sai về mặt kỹ thuật, vừa khiến người dùng tưởng phải làm tám
 * lần một việc.
 */
export interface ProviderFamilyMeta {
  readonly id: ProviderFamily
  readonly label: string
  readonly actionLabel: string
  readonly description: string
  readonly providers: readonly ProviderId[]
  /** Nền tảng trong nhóm cần duyệt riêng ngoài luồng OAuth thường. */
  readonly gatedProviders: readonly ProviderId[]
}

export const PROVIDER_FAMILIES: readonly ProviderFamilyMeta[] = [
  {
    id: 'google',
    label: 'Google',
    actionLabel: 'Kết nối tài khoản Google',
    description:
      'Một lần cấp quyền lấy được cả năm sản phẩm. Chọn tài khoản Google đang quản lý website của bạn.',
    providers: ['ga4', 'gsc', 'gtm', 'google-ads', 'merchant-center'],
    // Google Ads đòi developer token được Google duyệt riêng, không phải chỉ OAuth.
    gatedProviders: ['google-ads'],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    actionLabel: 'Đăng nhập YouTube',
    description:
      'Tách riêng khỏi Google ở trên — đăng nhập bằng đúng tài khoản Google đang quản lý kênh YouTube, có thể khác hẳn tài khoản quản lý Analytics/Search Console.',
    providers: ['youtube'],
    gatedProviders: [],
  },
  {
    id: 'meta',
    label: 'Meta',
    actionLabel: 'Kết nối tài khoản Meta',
    description:
      'Facebook Ads, Instagram, và nội dung Facebook dùng chung một lần cấp quyền qua Business Manager.',
    providers: ['meta-ads', 'instagram', 'facebook'],
    gatedProviders: [],
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    actionLabel: 'Đăng nhập bằng TikTok',
    description: 'Đăng nhập bằng chính tài khoản TikTok — chỉ đọc được video và số liệu của tài khoản đó.',
    providers: ['tiktok'],
    gatedProviders: [],
  },
]

export const familyOf = (provider: ProviderId): ProviderFamily =>
  PROVIDER_META[provider].family

export const isProviderId = (value: string): value is ProviderId =>
  (PROVIDERS as readonly string[]).includes(value)

const PROVIDER_FAMILY_IDS: readonly ProviderFamily[] = PROVIDER_FAMILIES.map(
  (family) => family.id,
)

export const isProviderFamily = (value: string): value is ProviderFamily =>
  (PROVIDER_FAMILY_IDS as readonly string[]).includes(value)

export const getProviderMeta = (id: ProviderId): ProviderMeta => PROVIDER_META[id]

export const providersWithCapability = (
  capability: ProviderCapability,
): readonly ProviderId[] =>
  PROVIDERS.filter((id) => PROVIDER_META[id].capabilities.includes(capability))

export const hasCapability = (
  id: ProviderId,
  capability: ProviderCapability,
): boolean => PROVIDER_META[id].capabilities.includes(capability)

/** Nền tảng mà `extra` là TRẠNG THÁI TẠI THỜI ĐIỂM đồng bộ (snapshot), không
 * phải chỉ số phát sinh mỗi ngày — cộng dồn nhiều ngày lại là nhân sai số.
 * Merchant Center: số sản phẩm đã duyệt/bị từ chối là trạng thái NGAY LÚC
 * ĐÓ. TikTok (Display API — Login Kit) cũng vậy: KHÔNG có endpoint báo cáo
 * lịch sử theo ngày như YouTube Analytics hay Meta Page Insights,
 * `fetchDailyMetrics` chỉ đọc được TRẠNG THÁI HIỆN TẠI (follower/video/like
 * count cộng dồn từ trước tới giờ) mỗi lần đồng bộ — xem `tiktok-metrics.ts`.
 * Facebook KHÔNG nằm trong danh sách này — Page Insights (cùng Graph API với
 * Instagram) có `period=day` thật, xem `facebook-metrics.ts`.
 *
 * Đặt ở tầng domain (không I/O) vì CẢ tầng đọc lẫn tầng ghi đều cần: tầng
 * đọc để không cộng dồn snapshot qua nhiều ngày, tầng ghi (`sync/backfill.ts`)
 * để KHÔNG nạp lịch sử cho nhóm này — nạp sẽ ghi số của HÔM NAY xuống một
 * ngày trong quá khứ, tức bịa ra lịch sử, tệ hơn hẳn việc để trống. Một bản
 * sao thứ hai của danh sách này ở file khác là rủi ro lệch nhau khi có nền
 * tảng snapshot mới. */
export const SNAPSHOT_PROVIDERS: ReadonlySet<ProviderId> = new Set(['merchant-center', 'tiktok'])
