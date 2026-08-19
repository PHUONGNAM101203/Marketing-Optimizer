'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, RefreshCw, TriangleAlert, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import {
  ensureInviteLink,
  regenerateInviteLink,
  setInviteLinkRole,
} from '@/lib/actions/site-invite'
import type { SiteRole } from '@/lib/domain/site'

/* Hallmark · component: invite-member-dialog · theme: studied-DNA (Ink & Signal)
 *
 * Không có hạ tầng gửi email trong app — một link cố định/site, chủ sở hữu/
 * quản trị tự copy rồi gửi qua kênh khác. Không cho gán vai trò `owner` qua
 * đây — một site chỉ có một chủ sở hữu, giữ đúng bất biến đó.
 */

export interface InviteMemberDialogProps {
  readonly siteId: string
  readonly initialToken: string | null
  readonly initialRole: SiteRole
}

export function InviteMemberDialog({ siteId, initialToken, initialRole }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState(initialToken)
  const [role, setRole] = useState<'admin' | 'viewer'>(initialRole === 'owner' ? 'viewer' : initialRole)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    setCopied(false)
    if (next && !token) {
      setError(null)
      startTransition(async () => {
        const result = await ensureInviteLink(siteId)
        if (result.error) setError(result.error)
        else setToken(result.token)
      })
    }
  }

  const handleRegenerate = () => {
    if (!window.confirm('Link mời cũ sẽ ngừng hoạt động ngay. Tiếp tục?')) return
    setError(null)
    setCopied(false)
    startTransition(async () => {
      const result = await regenerateInviteLink(siteId)
      if (result.error) setError(result.error)
      else setToken(result.token)
    })
  }

  const handleRoleChange = (next: 'admin' | 'viewer') => {
    setRole(next)
    startTransition(async () => {
      const result = await setInviteLinkRole({ siteId, role: next })
      if (result.error) setError(result.error)
    })
  }

  const inviteUrl = token && typeof window !== 'undefined' ? `${window.location.origin}/invite/${token}` : null

  const handleCopy = async () => {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <DialogRoot open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <UserPlus aria-hidden className="size-3.5" />
          Mời
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Mời thành viên"
        description="Ai có link này đều vào được site với vai trò bên dưới. Gửi link qua kênh bạn muốn (email, Zalo…) — app chưa tự gửi email."
      >
        <div className="flex flex-col gap-4">
          <FormField label="Vai trò cấp cho link này" htmlFor="invite-role">
            <select
              id="invite-role"
              value={role}
              onChange={(event) => handleRoleChange(event.target.value as 'admin' | 'viewer')}
              disabled={pending}
              className={inputClass}
            >
              <option value="viewer">Chỉ xem</option>
              <option value="admin">Quản trị</option>
            </select>
          </FormField>

          {error ? (
            <p className="flex items-center gap-1.5 text-[length:var(--text-sm)] text-[var(--color-negative)]">
              <TriangleAlert aria-hidden className="size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          {inviteUrl ? (
            <div className="flex flex-col gap-2">
              <p className="text-[length:var(--text-xs)] font-medium tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
                Link mời
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  onFocus={(event) => event.target.select()}
                  className={`${inputClass} font-mono text-[length:var(--text-xs)]`}
                />
                <Button type="button" variant="secondary" size="md" onClick={handleCopy}>
                  {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
                  {copied ? 'Đã sao chép' : 'Sao chép'}
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRegenerate}
                disabled={pending}
                className="self-start"
              >
                <RefreshCw aria-hidden className="size-3.5" />
                Tạo lại link (vô hiệu link cũ)
              </Button>
            </div>
          ) : (
            <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
              {pending ? 'Đang tạo link mời…' : 'Chưa có link mời.'}
            </p>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
