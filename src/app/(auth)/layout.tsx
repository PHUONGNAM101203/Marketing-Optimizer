import type { ReactNode } from 'react'
import Link from 'next/link'
import { Mark } from '@/components/brand/logo'
import { PROVIDERS, PROVIDER_META } from '@/lib/domain/providers'

/**
 * Khung trang xác thực.
 *
 * Bản trước chia đôi màn hình, một nửa là quạt tám đường cầu vồng hội tụ. Sai:
 * tám đường cùng độ đậm không nói gì cả, và cái quạt đó chính là mô-típ hero
 * mà mọi giao diện AI sinh ra đều vẽ. Cột form thì rỗng hoác.
 *
 * Bản này dựng chiều sâu bằng ba tín hiệu vật lý cùng lúc, không bằng màu:
 *   · CHỒNG LẤP  — các mặt phẳng lùi dần thò ra sau thẻ chính
 *   · THU NHỎ    — lùi bao nhiêu thì nhỏ bấy nhiêu
 *   · NHOÈ DẦN   — càng xa càng mất nét, đúng như ống kính thật
 * cộng thêm bóng bốn lớp và một lớp hạt grain. Ánh sáng đến từ MỘT nguồn phía
 * trên, và mọi bóng trên trang đều lệch cùng một hướng.
 */
export default function AuthLayout({
  children,
}: {
  readonly children: ReactNode
}) {
  return (
    <div className="grain relative isolate min-h-dvh overflow-hidden bg-[var(--color-paper-2)]">
      {/* lớp 1 · ánh sáng nền */}
      <div aria-hidden className="aurora pointer-events-none absolute inset-0 -z-20" />

      {/* lớp 2 · lưới rất nhạt, cho mắt một hệ quy chiếu để cảm được không gian */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 opacity-[0.55]"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-rule) 1px, transparent 1px), linear-gradient(90deg, var(--color-rule) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage:
            'radial-gradient(70% 55% at 50% 40%, black 0%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(70% 55% at 50% 40%, black 0%, transparent 78%)',
        }}
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-5 py-14">
        <Link
          href="/"
          className="mb-9 inline-flex items-center gap-2.5 rounded-[var(--radius-sm)]"
        >
          <Mark className="size-7 text-[var(--color-ink)]" />
          <span className="font-[family-name:var(--font-display)] text-[length:var(--text-xl)] font-bold tracking-[var(--tracking-tight)] text-[var(--color-ink)]">
            Confluence
          </span>
        </Link>

        {/* lớp 3 · chồng mặt phẳng + thẻ chính */}
        <div className="relative w-full">
          <RecedingPlanes />

          <div
            className="card-enter relative rounded-[calc(var(--radius-lg)+4px)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-7 sm:p-9"
            style={{ boxShadow: 'var(--shadow-lift)' }}
          >
            {/* gờ sáng mảnh trên mép — mặt phẳng thật bắt sáng ở cạnh trên */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-paper)] to-transparent opacity-90"
            />
            {children}
          </div>
        </div>

        <ul className="mt-9 flex max-w-md flex-wrap justify-center gap-x-4 gap-y-2">
          {PROVIDERS.map((provider) => (
            <li
              key={provider}
              className="flex items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--color-ink-3)]"
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: `var(${PROVIDER_META[provider].colorToken})` }}
              />
              {PROVIDER_META[provider].shortLabel}
            </li>
          ))}
        </ul>

        <p className="mt-6 max-w-sm text-center text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
          Kết nối tài khoản quảng cáo là hành động chỉ đọc. Không chiến dịch nào bị
          thay đổi nếu bạn chưa bấm duyệt.
        </p>
      </div>
    </div>
  )
}

/**
 * Ba mặt phẳng lùi dần sau thẻ chính.
 *
 * Cố ý để trống — không vẽ giao diện giả bên trong. Khung trình duyệt giả, ảnh
 * chụp màn hình giả, bảng số giả đều là thứ Hallmark cấm thẳng: môi trường của
 * người dùng đã có khung thật rồi, thêm khung giả chỉ làm lộ ra là đồ dựng.
 * Ở đây chúng chỉ là hình khối thuần tuý, và như vậy là đủ để mắt đọc ra
 * chiều sâu.
 */
function RecedingPlanes() {
  const planes = [
    { inset: '10%', top: -14, blur: 0.4, opacity: 0.7, delay: 60 },
    { inset: '18%', top: -27, blur: 1.4, opacity: 0.45, delay: 120 },
    { inset: '26%', top: -38, blur: 3, opacity: 0.26, delay: 180 },
  ]

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {planes.map((plane) => (
        <div
          key={plane.inset}
          className="plane absolute rounded-[calc(var(--radius-lg)+4px)] border border-[var(--color-rule)] bg-[var(--color-paper)]"
          style={{
            left: plane.inset,
            right: plane.inset,
            top: plane.top,
            height: 120,
            filter: `blur(${plane.blur}px)`,
            opacity: plane.opacity,
            boxShadow: 'var(--shadow-float)',
            animationDelay: `${plane.delay}ms`,
          }}
        />
      ))}
    </div>
  )
}
