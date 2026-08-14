import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/**
 * Icon cho màn hình chính iOS/iPadOS và "Add to Dock" trên macOS — cùng dấu
 * nhận diện với icon.tsx, chỉ phóng theo tỉ lệ 180/32 vì hai route này không
 * chia sẻ được config (mỗi route generation là một Route Handler riêng).
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
          borderRadius: 39,
        }}
      >
        <svg width="124" height="124" viewBox="0 0 24 24" fill="none">
          <g stroke="#fdfcf9" strokeWidth={1.9} strokeLinecap="round">
            <path d="M2.75 5.25C7.5 5.25 9.6 8.2 13.3 10.9" opacity={0.55} />
            <path d="M2.75 12H13.6" opacity={0.85} />
            <path d="M2.75 18.75C7.5 18.75 9.6 15.8 13.3 13.1" opacity={0.55} />
            <path d="M18.4 12H21.25" />
          </g>
          <circle cx={16} cy={12} r={2.5} fill="#7c5cff" />
        </svg>
      </div>
    ),
    size,
  )
}
