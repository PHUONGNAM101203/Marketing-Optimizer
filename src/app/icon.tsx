import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

/**
 * Favicon dựng từ chính dấu nhận diện.
 *
 * Khác `apple-icon.tsx`: ở đây GIỮ bo góc, vì favicon trong tab trình duyệt
 * được hiển thị nguyên trạng, không có hệ điều hành nào áp mặt nạ lên nó.
 *
 * `viewBox` cắt lề rỗng của khung 24×24 gốc để dấu ăn ~68% bề ngang — chừa
 * lại đủ lề bên trong hộp bo góc. Ở 32px chỉ giữ được ba nét vào, điểm hội tụ
 * và nét ra; chi tiết hơn nữa sẽ bết thành một vệt, nên nét cũng dày và sáng
 * hơn bản dùng ở cỡ lớn.
 */
export default function Icon() {
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
          borderRadius: 7,
        }}
      >
        <svg width="32" height="32" viewBox="-1.6 -1.6 27.2 27.2" fill="none">
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
