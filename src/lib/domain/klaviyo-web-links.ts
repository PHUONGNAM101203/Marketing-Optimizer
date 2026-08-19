/**
 * Deep-link THẲNG vào một tài nguyên Klaviyo cụ thể trong web app, theo ID —
 * KHÁC `externalAccountUrl` ở `external-links.ts` (chỉ link chung tới trang
 * campaigns của TÀI KHOẢN, vì Klaviyo account ID không tra được đúng phiên
 * đăng nhập của trình duyệt). Đây là link tới TỪNG campaign/flow/segment/
 * list/form cụ thể, theo yêu cầu "xem chi tiết từng cái, có link dẫn thẳng".
 *
 * CHỈ pattern `form` được xác nhận qua tài liệu/cộng đồng Klaviyo (8/2026:
 * "https://www.klaviyo.com/forms/edit/{id}"). Klaviyo KHÔNG công bố tài
 * liệu chính thức cho URL web app của campaign/flow/segment/list (chỉ có
 * tài liệu REST API, khác hẳn) — các pattern dưới đây dựa trên cấu trúc URL
 * phổ biến, quan sát được của Klaviyo web app, CHƯA verify bằng tài khoản
 * thật. Nếu redirect sai trang, sửa lại đúng theo phản hồi thực tế thay vì
 * đoán tiếp.
 */
export type KlaviyoResourceKind = 'campaign' | 'flow' | 'segment' | 'list' | 'form'

export const klaviyoResourceUrl = (kind: KlaviyoResourceKind, id: string): string => {
  switch (kind) {
    case 'campaign':
      return `https://www.klaviyo.com/campaign/${id}`
    case 'flow':
      return `https://www.klaviyo.com/flow/${id}`
    case 'segment':
      return `https://www.klaviyo.com/segment/${id}`
    case 'list':
      return `https://www.klaviyo.com/list/${id}`
    case 'form':
      return `https://www.klaviyo.com/forms/edit/${id}`
  }
}

/** Trang danh sách khách hàng (profile) — không link được tới TỪNG khách
 * hàng vì app này chỉ đếm số lượng (`countKlaviyoProfiles`), không liệt kê
 * từng profile theo tên/email. */
export const KLAVIYO_PROFILES_URL = 'https://www.klaviyo.com/profiles'
