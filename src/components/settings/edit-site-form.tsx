'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import { updateSite, type UpdateSiteState } from '@/lib/actions/site'
import { listCurrencyOptions, listTimezoneOptions } from '@/lib/intl-options'
import { COUNTRY_OPTIONS, TLD_MARKET } from '@/lib/audit/market-detection'
import type { Site } from '@/lib/domain/site'

const CURRENCY_OPTIONS = listCurrencyOptions()
const TIMEZONE_OPTIONS = listTimezoneOptions()
const OTHER_COUNTRY = ''

/* Hallmark · component: edit-site-form · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active · disabled · loading · error · success
 *
 * Tên miền không phải ô nhập — luôn tính lại từ URL trong server action, nên
 * ở đây chỉ hiện nó như thông tin tham khảo, không cho gõ trực tiếp.
 *
 * Quốc gia là lối tắt: chọn một quốc gia trong danh sách đã hỗ trợ tự điền
 * ĐÚNG cặp currency/timezone khớp nhau (cùng bảng `TLD_MARKET` dùng để tự
 * phát hiện — không có chuyện chọn tay ra kết quả khác tự động phát hiện).
 * Hai ô Múi giờ/Đơn vị tiền vẫn luôn sửa tay được sau đó — quốc gia chỉ là
 * gợi ý khởi điểm, không khoá chúng lại.
 */

export interface EditSiteFormProps {
  readonly site: Site
}

export function EditSiteForm({ site }: EditSiteFormProps) {
  const [open, setOpen] = useState(false)
  const [country, setCountry] = useState(site.country ?? OTHER_COUNTRY)
  const [timezone, setTimezone] = useState(site.timezone)
  const [currency, setCurrency] = useState(site.currency)
  const [state, formAction, pending] = useActionState<UpdateSiteState, FormData>(updateSite, {
    error: null,
    success: false,
  })

  useEffect(() => {
    if (state.success) {
      const timeout = setTimeout(() => setOpen(false), 900)
      return () => clearTimeout(timeout)
    }
  }, [state.success])

  const handleCountryChange = (code: string): void => {
    setCountry(code)
    const market = TLD_MARKET[code]
    if (market) {
      setTimezone(market.timezone)
      setCurrency(market.currency)
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="md">
          Sửa thông tin
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Sửa thông tin website"
        description="Tên miền tự tính lại từ URL, dùng để khớp với property GA4/Search Console lúc kết nối."
      >
        <form key={open ? 'open' : 'closed'} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="siteId" value={site.id} />

          <FormField label="Tên hiển thị" htmlFor="edit-site-name">
            <input
              id="edit-site-name"
              name="name"
              type="text"
              required
              maxLength={120}
              defaultValue={site.name}
              className={inputClass}
            />
          </FormField>

          <FormField label="URL" htmlFor="edit-site-url" hint={`Tên miền hiện tại: ${site.domain}`}>
            <input
              id="edit-site-url"
              name="url"
              type="text"
              required
              defaultValue={site.url}
              className={inputClass}
            />
          </FormField>

          <FormField
            label="Quốc gia"
            htmlFor="edit-site-country"
            hint="Chọn quốc gia để tự điền đúng múi giờ + đơn vị tiền khớp nhau bên dưới."
          >
            <select
              id="edit-site-country"
              name="country"
              value={country}
              onChange={(event) => handleCountryChange(event.currentTarget.value)}
              className={inputClass}
            >
              <option value={OTHER_COUNTRY}>Khác — tự chọn múi giờ/đơn vị tiền bên dưới</option>
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Múi giờ"
              htmlFor="edit-site-timezone"
              hint="Quyết định ranh giới ngày của mọi số liệu."
            >
              <select
                id="edit-site-timezone"
                name="timezone"
                required
                value={timezone}
                onChange={(event) => setTimezone(event.currentTarget.value)}
                className={inputClass}
              >
                {TIMEZONE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Đơn vị tiền" htmlFor="edit-site-currency" hint="Mã ISO 4217.">
              <select
                id="edit-site-currency"
                name="currency"
                required
                value={currency}
                onChange={(event) => setCurrency(event.currentTarget.value)}
                className={inputClass}
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {state.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-negative-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-[var(--color-negative)]"
              />
              {state.error}
            </p>
          ) : null}

          {state.success ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-positive-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <Check aria-hidden className="size-4 shrink-0 text-[var(--color-positive)]" />
              Đã lưu.
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="md"
            state={pending ? 'loading' : 'idle'}
            loadingLabel="Đang lưu…"
            className="w-full"
          >
            Lưu thay đổi
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
