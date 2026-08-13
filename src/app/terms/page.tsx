import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalList, LegalPageShell, LegalSection } from '@/components/legal/legal-page-shell'

export const metadata: Metadata = {
  title: 'Điều khoản dịch vụ',
  description: 'Điều khoản sử dụng Confluence.',
}

const UPDATED_AT = '13/08/2026'

export default function TermsOfServicePage() {
  return (
    <LegalPageShell
      title="Điều khoản dịch vụ"
      updatedAt={UPDATED_AT}
      copyrightYear={2026}
      otherPageHref="/privacy"
      otherPageLabel="Chính sách quyền riêng tư →"
    >
      <p>
        Điều khoản này áp dụng khi bạn dùng Confluence (<code>marketing-optimizer-zeta.vercel.app</code>),
        vận hành bởi <strong>Phuong Nam</strong> (liên hệ:{' '}
        <a href="mailto:pnamhuynhle@gmail.com" className="text-[var(--color-signal)] hover:underline">
          pnamhuynhle@gmail.com
        </a>
        ). Tạo tài khoản hoặc kết nối bất kỳ nền tảng nào nghĩa là bạn đồng ý với điều khoản dưới
        đây và{' '}
        <Link href="/privacy" className="text-[var(--color-signal)] hover:underline">
          Chính sách quyền riêng tư
        </Link>
        .
      </p>

      <LegalSection title="1. Dịch vụ là gì">
        <p>
          Confluence là công cụ tổng hợp và hiển thị số liệu marketing từ các tài khoản Google,
          Meta và TikTok mà bạn tự kết nối, phục vụ theo dõi, phân tích và lên kế hoạch. Đây là
          sản phẩm ở giai đoạn đầu, đang tiếp tục hoàn thiện.
        </p>
      </LegalSection>

      <LegalSection title="2. Điều kiện kết nối tài khoản">
        <LegalList
          items={[
            'Bạn phải là chủ sở hữu hoặc được uỷ quyền hợp lệ để kết nối bất kỳ tài khoản Google Ads/Analytics/Search Console/Tag Manager/YouTube, tài khoản Meta (Trang Facebook/Instagram) hoặc tài khoản TikTok nào vào Confluence.',
            'Bạn chịu trách nhiệm về tính chính xác của thông tin website (domain, múi giờ, đơn vị tiền tệ...) mà bạn tự khai báo.',
            'Bạn có thể ngắt kết nối bất kỳ nền tảng nào bất cứ lúc nào từ trang Kết nối, hoặc thu hồi quyền truy cập trực tiếp từ cài đặt bảo mật của chính nền tảng đó (Google/Meta/TikTok).',
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Phạm vi truy cập">
        <p>
          Mọi kết nối nền tảng đều ở chế độ <strong>chỉ đọc báo cáo</strong> theo mặc định.
          Confluence không tự ý tạo, sửa, xoá hay tạm dừng chiến dịch, quảng cáo, bài đăng hay bất
          kỳ tài sản nào trên tài khoản của bạn. Các tính năng có khả năng ghi (ví dụ AI Agent đề
          xuất điều chỉnh ngân sách trong tương lai) luôn yêu cầu bạn bấm duyệt thủ công trước khi
          thực thi — không có đường nào tự động ghi ra nền tảng thật mà không qua bước đó.
        </p>
      </LegalSection>

      <LegalSection title="4. Hành vi không được phép">
        <LegalList
          items={[
            'Cố ý truy cập dữ liệu của website/tài khoản không thuộc quyền quản lý của bạn.',
            'Can thiệp, dò quét lỗ hổng, hoặc gây quá tải hệ thống (rate-limit abuse) đối với Confluence hoặc các API nền tảng thứ ba mà nó gọi tới.',
            'Sao chép, dịch ngược, hoặc khai thác lại mã nguồn/thiết kế của Confluence ngoài phạm vi sử dụng thông thường.',
            'Dùng dịch vụ cho mục đích trái pháp luật.',
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Không liên kết với các nền tảng thứ ba">
        <p>
          Confluence là một công cụ độc lập, sử dụng API công khai của Google, Meta và TikTok theo
          đúng điều khoản nhà phát triển của từng bên. Confluence{' '}
          <strong>không được các nền tảng đó chứng thực, bảo trợ hay liên kết chính thức</strong>.
        </p>
      </LegalSection>

      <LegalSection title="6. Miễn trừ bảo đảm">
        <p>
          Dịch vụ được cung cấp theo hiện trạng (&quot;as is&quot;), đang trong giai đoạn phát
          triển tích cực. Chúng tôi không cam kết dịch vụ hoạt động liên tục không gián đoạn, và số
          liệu hiển thị phụ thuộc vào độ chính xác/khả dụng của API các nền tảng gốc — có thể có sai
          lệch hoặc gián đoạn ngoài ý muốn.
        </p>
      </LegalSection>

      <LegalSection title="7. Giới hạn trách nhiệm">
        <p>
          Trong phạm vi pháp luật cho phép, Confluence và người vận hành không chịu trách nhiệm cho
          bất kỳ thiệt hại gián tiếp, phát sinh, hay mất mát dữ liệu/doanh thu nào liên quan đến
          việc sử dụng dịch vụ — bao gồm cả quyết định marketing bạn đưa ra dựa trên số liệu hiển
          thị trên đây.
        </p>
      </LegalSection>

      <LegalSection title="8. Chấm dứt">
        <p>
          Bạn có thể ngừng sử dụng và yêu cầu xoá tài khoản bất cứ lúc nào (xem mục 6 của Chính
          sách quyền riêng tư). Chúng tôi có thể tạm ngưng hoặc chấm dứt quyền truy cập nếu phát
          hiện vi phạm mục 4 ở trên.
        </p>
      </LegalSection>

      <LegalSection title="9. Thay đổi điều khoản">
        <p>
          Điều khoản có thể được cập nhật khi dịch vụ thay đổi. Ngày &quot;Cập nhật lần cuối&quot;
          ở đầu trang phản ánh lần sửa đổi gần nhất.
        </p>
      </LegalSection>

      <LegalSection title="10. Liên hệ">
        <p>
          Mọi câu hỏi về điều khoản này, gửi tới{' '}
          <a href="mailto:pnamhuynhle@gmail.com" className="text-[var(--color-signal)] hover:underline">
            pnamhuynhle@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
