'use client'

import { forwardRef, type KeyboardEvent, type TextareaHTMLAttributes } from 'react'

/* Hallmark · component: textarea · theme: studied-DNA (Ink & Signal)
 *
 * Ô nhiều dòng, gửi form bằng ⌘/Ctrl + Enter.
 *
 * Vì sao không phải Enter trơn: trong ô một dòng, Enter gửi form là hành vi mặc
 * định của trình duyệt và đúng. Trong ô NHIỀU DÒNG thì Enter phải xuống dòng —
 * biến nó thành phím gửi là lấy mất chức năng chính của ô. ⌘/Ctrl + Enter là
 * quy ước sẵn có cho việc này (GitHub, Slack, Linear đều dùng), nên không phải
 * học thêm gì.
 *
 * `requestSubmit()` chứ không phải `submit()`: `submit()` BỎ QUA cả `required`
 * lẫn handler `onSubmit` của React, tức gửi thẳng dữ liệu chưa được kiểm và
 * bỏ qua Server Action. `requestSubmit()` đi đúng đường như khi bấm nút.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ onKeyDown, ...props }, ref) {
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(event)
      // Nhường quyền cho nơi gọi: nó đã xử lý phím này thì không chen vào.
      if (event.defaultPrevented) return
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return

      const form = event.currentTarget.form
      if (!form) return
      event.preventDefault()
      form.requestSubmit()
    }

    return <textarea ref={ref} onKeyDown={handleKeyDown} {...props} />
  },
)
