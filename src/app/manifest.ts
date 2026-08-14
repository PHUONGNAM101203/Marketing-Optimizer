import type { MetadataRoute } from 'next'

/**
 * icon-192/512 là PNG tĩnh (không dựng bằng ImageResponse như icon.tsx) vì
 * manifest icons cần kích thước cố định cho màn hình cài đặt PWA/desktop —
 * route generation của icon.tsx chỉ phục vụ favicon 32px.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Marketing Optimizer',
    short_name: 'Marketing Optimizer',
    description:
      'Trung tâm điều hành marketing: hợp nhất số liệu Google, Meta, TikTok và YouTube quanh một website.',
    start_url: '/',
    display: 'standalone',
    background_color: '#14161c',
    theme_color: '#14161c',
    icons: [
      {
        src: '/brand/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/brand/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
