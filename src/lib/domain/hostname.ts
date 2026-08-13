/**
 * Chuẩn hoá hostname để so khớp domain giữa Site và tài sản Google (GA4
 * property, Search Console site) — cả hai phía phải quy về cùng một dạng thì
 * so sánh chuỗi mới có nghĩa.
 */
export const normalizeHostname = (host: string): string => host.toLowerCase().replace(/^www\./, '')
