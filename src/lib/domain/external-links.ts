import type { ProviderId } from './providers'

/**
 * Đường dẫn RA THẲNG tài khoản thật trên nền tảng gốc — không phải link
 * chung chung về trang chủ sản phẩm. Dùng khi người dùng cần vào sửa/xử lý
 * trực tiếp (vd. một sản phẩm bị Merchant Center từ chối, một chiến dịch
 * Ads cần điều chỉnh) mà app này CỐ TÌNH không có quyền ghi — luôn đưa
 * thẳng ra nơi họ có thể tự tay làm việc đó.
 *
 * `externalAccountId` là giá trị lưu trong `connections.external_account_id`
 * — hình dạng khác nhau theo từng nền tảng, xem comment ở mỗi case.
 *
 * `null` khi không có cách deep-link đáng tin cậy tới đúng tài sản (vd.
 * Instagram không tra được URL công khai theo ID số) — KHÔNG đoán một URL
 * có thể sai.
 */
export const externalAccountUrl = (
  provider: ProviderId,
  externalAccountId: string,
): string | null => {
  switch (provider) {
    // "properties/123456" → GA4 UI nhận ID số thuần, không có tiền tố.
    case 'ga4': {
      const numericId = externalAccountId.replace('properties/', '')
      return `https://analytics.google.com/analytics/web/#/p${numericId}/reports/intelligenthome`
    }

    // "sc-domain:example.com" hoặc "https://example.com/" — Search Console
    // nhận nguyên văn qua tham số resource_id, đã mã hoá URL.
    case 'gsc':
      return `https://search.google.com/search-console?resource_id=${encodeURIComponent(externalAccountId)}`

    // "accounts/X/containers/Y" (path nội bộ Tag Manager) → deep-link vào
    // đúng workspace mặc định của container đó.
    case 'gtm':
      return `https://tagmanager.google.com/#/container/${externalAccountId}/workspaces`

    case 'youtube':
      return `https://studio.youtube.com/channel/${externalAccountId}`

    // Merchant ID thuần — tham số `a` chọn đúng tài khoản trong Merchant Center.
    case 'merchant-center':
      return `https://merchants.google.com/mc/products?a=${externalAccountId}`

    // Customer ID thường không đủ để deep-link đúng tài khoản (Ads UI cần
    // "ocid" nội bộ, khác customer ID) — đưa về trang chọn tài khoản thay vì
    // đoán một URL có thể vào nhầm tài khoản.
    case 'google-ads':
      return 'https://ads.google.com/aw/overview'

    // "act_1234567890" (Graph API trả sẵn tiền tố) → Ads Manager nhận ID số
    // thuần qua tham số `act`.
    case 'meta-ads':
      return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${externalAccountId.replace('act_', '')}`

    // ID số của Instagram Business Account — Instagram không có URL công khai
    // tra được theo ID số (chỉ theo username, không lưu ở đây) — không đoán
    // một đường dẫn có thể sai, để `null` như quy ước chung của file này.
    case 'instagram':
      return null

    // `externalAccountId` giờ là `open_id` của TikTok Login Kit (đổi từ
    // advertiser_id của Marketing API cũ) — open_id không tra ra được URL
    // hồ sơ công khai (chỉ TikTok nội bộ mới đọc được), cùng lý do Instagram
    // để `null` ở trên, không đoán một đường dẫn có thể sai.
    case 'tiktok':
      return null

    // ID số của Trang Facebook — Page ID tra thẳng ra URL công khai được,
    // khác hẳn Instagram Business Account ID/TikTok open_id ở trên.
    case 'facebook':
      return `https://facebook.com/${externalAccountId}`
  }
}
