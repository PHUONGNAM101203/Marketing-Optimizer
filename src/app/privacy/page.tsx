import type { Metadata } from 'next'
import { LegalList, LegalPageShell, LegalSection } from '@/components/legal/legal-page-shell'

export const metadata: Metadata = {
  title: 'Chính sách quyền riêng tư',
  description: 'Confluence thu thập, sử dụng và bảo vệ dữ liệu của bạn như thế nào.',
}

const UPDATED_AT = '15/08/2026'

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title="Chính sách quyền riêng tư"
      updatedAt={UPDATED_AT}
      copyrightYear={2026}
      otherPageHref="/terms"
      otherPageLabel="Điều khoản dịch vụ →"
    >
      <p>
        Confluence (<code>marketing-optimizer-zeta.vercel.app</code>) là một công cụ tổng hợp số
        liệu marketing — kết nối các tài khoản Google, Meta (Facebook/Instagram) và TikTok của
        bạn để hiển thị chung một bảng điều khiển, thay vì phải mở từng nền tảng riêng lẻ. Chính
        sách này giải thích chính xác dữ liệu nào được thu thập, dùng để làm gì, và bạn kiểm soát
        nó ra sao.
      </p>
      <p>
        Đơn vị chịu trách nhiệm dữ liệu (data controller): <strong>Phuong Nam</strong>. Mọi câu
        hỏi về quyền riêng tư, xin gửi tới{' '}
        <a href="mailto:pnamhuynhle@gmail.com" className="text-[var(--color-signal)] hover:underline">
          pnamhuynhle@gmail.com
        </a>
        .
      </p>

      <LegalSection title="1. Dữ liệu chúng tôi thu thập">
        <p>Ba nhóm dữ liệu:</p>
        <LegalList
          items={[
            <>
              <strong>Thông tin tài khoản Confluence</strong> — email đăng nhập, và các thông tin
              về website bạn tự khai báo (tên, domain, múi giờ, đơn vị tiền tệ, quốc gia).
            </>,
            <>
              <strong>Token truy cập nền tảng thứ ba</strong> — khi bạn kết nối Google/Meta/TikTok,
              chúng tôi lưu access token/refresh token do nền tảng đó cấp, dùng để đọc báo cáo thay
              bạn ở những lần đồng bộ sau. Token được mã hoá AES-256-GCM trước khi lưu vào cơ sở dữ
              liệu — xem mục 3.
            </>,
            <>
              <strong>Dữ liệu báo cáo đọc được từ các nền tảng đó</strong> — chỉ trong phạm vi các
              quyền (scope) liệt kê dưới đây, không hơn.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="2. Quyền truy cập (OAuth scope) xin từ từng nền tảng">
        <p>
          Tất cả đều là quyền <strong>chỉ đọc báo cáo</strong> — không quyền tạo, sửa, xoá hay tạm
          dừng bất kỳ chiến dịch/nội dung nào, ngoại trừ khi bạn chủ động bật thêm quyền quản lý
          quảng cáo (Google Ads/Facebook Ads) và luôn có thông báo rõ trước khi cấp.
        </p>
        <LegalList
          items={[
            <>
              <strong>Google</strong> (Analytics, Search Console, Tag Manager):{' '}
              <code>analytics.readonly</code>, <code>webmasters.readonly</code>,{' '}
              <code>tagmanager.readonly</code>. Tuỳ chọn thêm khi bạn bật: <code>adwords</code>{' '}
              (Google Ads), <code>content</code> (Merchant Center).
            </>,
            <>
              <strong>YouTube</strong> (đăng nhập riêng, có thể khác tài khoản Google ở trên):{' '}
              <code>youtube.readonly</code>, <code>yt-analytics.readonly</code>.
            </>,
            <>
              <strong>Meta</strong> (Facebook/Instagram):{' '}
              <code>pages_show_list</code>, <code>pages_read_engagement</code>,{' '}
              <code>read_insights</code>, <code>instagram_basic</code>,{' '}
              <code>instagram_manage_insights</code>, <code>business_management</code>. Tuỳ chọn
              thêm khi bạn bật: <code>ads_read</code> (Facebook Ads).
            </>,
            <>
              <strong>TikTok</strong>: <code>user.info.basic</code>, <code>user.info.stats</code>,{' '}
              <code>video.list</code> — đọc thông tin hồ sơ, số liệu người theo dõi và danh sách
              video công khai của CHÍNH tài khoản TikTok bạn dùng để đăng nhập.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Lưu trữ và bảo mật">
        <LegalList
          items={[
            'Dữ liệu lưu trên Supabase (Postgres), theo mô hình mỗi website một không gian riêng — Row Level Security chặn triệt để việc người dùng A đọc được dữ liệu của người dùng B ở tầng cơ sở dữ liệu, không chỉ ở giao diện.',
            'Token truy cập/refresh token mã hoá AES-256-GCM trước khi lưu, bằng khoá riêng không nằm trong cơ sở dữ liệu — kể cả khi cơ sở dữ liệu bị lộ, token vẫn không giải mã được nếu không có khoá đó.',
            'Bảng lưu token không có quyền đọc/ghi công khai nào (kể cả cho tài khoản đã đăng nhập) — chỉ phần phía server, đã tự kiểm tra quyền, mới chạm được.',
            'Token không bao giờ được gửi tới trình duyệt của bạn. Mọi lệnh gọi tới Google/Meta/TikTok đều chạy ở phía máy chủ.',
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Cách chúng tôi dùng dữ liệu">
        <p>
          Dữ liệu chỉ dùng để hiển thị bảng điều khiển/báo cáo cho đúng chủ sở hữu website đó — so
          sánh chéo số liệu giữa các nền tảng, phát hiện bất thường, gợi ý tối ưu. Chúng tôi{' '}
          <strong>không bán</strong> dữ liệu, <strong>không chia sẻ</strong> cho bên quảng cáo thứ
          ba, và <strong>không dùng để huấn luyện mô hình AI</strong> nào.
        </p>
        <p>
          Tính năng gợi ý bằng AI (AI Visibility, Prompt Studio, Agents) hiện <strong>chưa kết nối
          với bất kỳ dịch vụ AI thực nào</strong> — dữ liệu của bạn hiện không được gửi ra ngoài
          cho mục đích này. Nếu tính năng đó được bật trong tương lai, chính sách này sẽ được cập
          nhật trước, nêu rõ dữ liệu nào được gửi và gửi tới đâu.
        </p>
      </LegalSection>

      <LegalSection title="5. Chia sẻ với bên thứ ba">
        <p>
          Ngoài chính các nền tảng Google/Meta/TikTok (để lấy đúng dữ liệu bạn đã cho phép) và hạ
          tầng kỹ thuật vận hành dịch vụ (Supabase — cơ sở dữ liệu; Vercel — máy chủ lưu trữ ứng
          dụng), chúng tôi không chia sẻ dữ liệu của bạn cho bất kỳ bên nào khác.
        </p>
      </LegalSection>

      <LegalSection title="6. Thời gian lưu trữ và xoá dữ liệu">
        <LegalList
          items={[
            'Ngắt kết nối một nền tảng (nút "Ngắt kết nối") xoá ngay token và dừng đồng bộ — dữ liệu báo cáo đã lưu trước đó vẫn giữ lại trừ khi bạn yêu cầu xoá hẳn.',
            <>
              Muốn xoá toàn bộ tài khoản và dữ liệu liên quan, gửi yêu cầu tới{' '}
              <a href="mailto:pnamhuynhle@gmail.com" className="text-[var(--color-signal)] hover:underline">
                pnamhuynhle@gmail.com
              </a>{' '}
              — xử lý trong vòng 30 ngày.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Trẻ em">
        <p>
          Confluence không hướng tới và không cố ý thu thập dữ liệu của trẻ em dưới 16 tuổi.
        </p>
      </LegalSection>

      <LegalSection title="8. Thay đổi chính sách">
        <p>
          Khi có thay đổi đáng kể, ngày &quot;Cập nhật lần cuối&quot; ở đầu trang sẽ đổi theo. Bạn
          nên xem lại trang này định kỳ.
        </p>
      </LegalSection>

      <LegalSection title="9. Ghi chú riêng cho từng nền tảng">
        <p>
          Việc sử dụng dữ liệu Facebook/Instagram tuân theo{' '}
          <a
            href="https://developers.facebook.com/devpolicy/"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--color-signal)] hover:underline"
          >
            Chính sách nền tảng của Meta
          </a>
          . Confluence không được Meta hay TikTok chứng thực hay tài trợ.
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
