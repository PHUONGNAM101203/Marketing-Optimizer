import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getCurrentUser } from '@/lib/supabase/server'
import { signOut } from '@/lib/actions/auth'

/* Hallmark · component: not-found · theme: studied-DNA (Ink & Signal)
 *
 * Trang 404 chung. Tồn tại vì trang mặc định của Next chỉ hiện đúng chữ "404",
 * khiến tình huống PHỔ BIẾN NHẤT dẫn tới đây trông như app hỏng: mở một đường
 * dẫn của Site thuộc tài khoản KHÁC trên cùng trình duyệt. `[siteId]/layout`
 * gọi `notFound()` cho cả site không tồn tại lẫn site không có quyền, nên người
 * dùng chỉ thấy một màn hình trống không giải thích gì.
 *
 * CỐ Ý KHÔNG phân biệt "không tồn tại" với "không có quyền" — đó là quy ước của
 * repo (xem `[siteId]/layout.tsx`): trả 403 là xác nhận site đó CÓ TỒN TẠI cho
 * người không có quyền với nó. Lời văn dưới đây bao cả hai khả năng và vẫn giúp
 * được người dùng, thay vì phải chọn giữa rò rỉ thông tin và bỏ mặc họ.
 *
 * Nêu email đang đăng nhập là phần quan trọng nhất: đó là thứ biến "app lỗi rồi"
 * thành "à, mình đang ở nhầm tài khoản".
 */
export default async function NotFound() {
  // Không được ném lỗi ở đây: trang này CHÍNH LÀ nơi xử lý lỗi. Phiên hỏng thì
  // bỏ phần email đi, phần còn lại vẫn dùng được.
  const user = await getCurrentUser().catch(() => null)
  const email = user?.email

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <p className="text-[length:var(--text-xs)] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
          404
        </p>
        <h1 className="mt-2 text-[length:var(--text-xl)] font-semibold text-[var(--color-ink)]">
          Không mở được trang này
        </h1>
        <p className="mt-3 text-[length:var(--text-sm)] leading-relaxed text-[var(--color-ink-2)]">
          {email ? (
            <>
              Đường dẫn không tồn tại, hoặc nó thuộc về một tài khoản khác. Bạn đang đăng nhập bằng{' '}
              <span className="font-medium text-[var(--color-ink)]">{email}</span>.
            </>
          ) : (
            <>Đường dẫn không tồn tại, hoặc bạn cần đăng nhập để mở nó.</>
          )}
        </p>

        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="primary">
            <Link href="/">{email ? 'Về site của bạn' : 'Đăng nhập'}</Link>
          </Button>
          {email ? (
            <form action={signOut}>
              <Button type="submit" variant="ghost">
                Đổi tài khoản
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </main>
  )
}
