'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * Trạng thái mở/đóng của `MobileNavDrawer`, chia sẻ giữa `Topbar` (nút
 * hamburger, `lg:hidden`) và `MobileNavDrawer` (`side-rail.tsx`'s thay thế
 * trên mobile) — hai component này là ANH EM (cùng con của
 * `(app)/[siteId]/layout.tsx`), không phải cha-con, nên cần Context thay vì
 * truyền prop xuống thẳng.
 */
interface MobileNavContextValue {
  readonly open: boolean
  readonly setOpen: (open: boolean) => void
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null)

export function MobileNavProvider({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>
}

export function useMobileNav(): MobileNavContextValue {
  const context = useContext(MobileNavContext)
  if (!context) throw new Error('useMobileNav phải dùng bên trong MobileNavProvider')
  return context
}
