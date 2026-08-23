import type { MetadataRoute } from 'next'

/**
 * Manifest cho "Thêm vào màn hình chính".
 *
 * Icon là PNG tĩnh trong `public/brand/` (không dựng bằng `ImageResponse` như
 * `icon.tsx`/`apple-icon.tsx`) vì trình cài đặt PWA đọc manifest TRƯỚC khi có
 * gì render, nên nó cần URL trả về ảnh ngay, kích thước cố định.
 *
 * Hai `purpose` là bắt buộc, không phải cho đẹp:
 * - `any`: dùng ở nơi ảnh KHÔNG bị cắt (iOS, desktop, danh sách cài đặt).
 *   Dấu nhận diện ăn 78% bề ngang.
 * - `maskable`: Android cắt icon theo hình do NHÀ SẢN XUẤT máy quyết định
 *   (tròn, squircle, giọt nước...). Chỉ vùng tròn đường kính 80% canvas là
 *   chắc chắn không bị cắt. Thiếu bản này, Android không dám cắt nên nhét
 *   nguyên icon vào một huy hiệu tròn trắng rồi thu nhỏ lại — dấu nhận diện
 *   teo đi lần nữa và lệch hẳn khỏi các icon khác trên màn hình. Bản maskable
 *   để dấu ăn 62% (đường chéo của dấu ≈ 22.9 đơn vị phải lọt trong vòng an
 *   toàn) nên trông CÙNG cỡ với bản `any` sau khi hệ điều hành cắt xong.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Marketing Optimizer',
    // Tên dưới icon trên màn hình chính — điện thoại cắt tên dài, đặt ngắn
    // sẵn ở đây thay vì để hệ điều hành tự cắt thành "Marketing Optim…".
    short_name: 'Optimizer',
    description:
      'Trung tâm điều hành marketing: hợp nhất số liệu Google, Meta, TikTok và YouTube quanh một website.',
    lang: 'vi',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Màu màn hình chờ lúc mở app từ màn hình chính. Phải khớp NỀN TRANG
    // (`--color-paper` ở nhánh tối = oklch(17.5% 0.008 265) = #0f1014), không
    // phải nền của icon (#14161c = `--color-paper-2`, một bậc sáng hơn) —
    // lệch hai màu này thì lúc mở app có một cú nháy đổi nền. Manifest chỉ
    // nhận MỘT giá trị, không có media query, nên lấy nhánh tối.
    background_color: '#0f1014',
    theme_color: '#0f1014',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/brand/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
