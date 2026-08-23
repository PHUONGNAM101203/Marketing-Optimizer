import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/**
 * Icon cho màn hình chính iOS/iPadOS và "Add to Dock" trên macOS.
 *
 * KHÔNG bo góc ở đây, dù bản trước có `borderRadius: 39`. iOS TỰ áp mặt nạ
 * squircle lên apple-touch-icon; ảnh đã bo sẵn sẽ bị bo lần thứ hai và bốn
 * góc lòi ra một viền tối lởm chởm trên nền của người dùng. Ảnh phải tràn
 * viền, đục hoàn toàn, để hệ điều hành tự cắt.
 *
 * `viewBox` cắt bớt phần lề rỗng của khung 24×24 gốc: dấu nhận diện chỉ chiếm
 * x 2.75..21.25 và y 5.25..18.75, phần còn lại là khoảng trắng của viewBox
 * chứ không phải của thiết kế. Neo theo tâm (12,12) — dấu vốn đã cân giữa —
 * và lấy cạnh 18.5/0.78 để dấu ăn 78% bề ngang, KHỚP với PNG trong manifest.
 * Bản cũ để svg 124px trong khung 180px, tức dấu chỉ chiếm ~53%, nhìn lọt
 * thỏm khi thu về cỡ icon thật trên điện thoại.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#14161c',
        }}
      >
        <svg width="180" height="180" viewBox="0.14 0.14 23.72 23.72" fill="none">
          {/* Nét dày và sáng hơn bản cũ: ở cỡ icon thật, opacity 0.55 trên
              nền #14161c gần như tan vào nền, chỉ còn thanh ngang và chấm
              tím đọc được — mất luôn ý "ba nguồn hội tụ". */}
          <g stroke="#fdfcf9" strokeWidth={2.15} strokeLinecap="round">
            <path d="M2.75 5.25C7.5 5.25 9.6 8.2 13.3 10.9" opacity={0.72} />
            <path d="M2.75 12H13.6" opacity={0.92} />
            <path d="M2.75 18.75C7.5 18.75 9.6 15.8 13.3 13.1" opacity={0.72} />
            <path d="M18.4 12H21.25" />
          </g>
          <circle cx={16} cy={12} r={2.5} fill="#7c5cff" />
        </svg>
      </div>
    ),
    size,
  )
}
