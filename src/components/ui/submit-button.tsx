'use client'

import { useFormStatus } from 'react-dom'
import { Button, type ButtonProps } from '@/components/ui/button'

/**
 * `<Button type="submit">` bọc `useFormStatus` — cho form action bấm-là-chạy
 * có phản hồi ngay (spinner + khoá nút) mà KHÔNG bắt cả component cha phải
 * là Client Component. `useFormStatus` chỉ đọc được trạng thái của `<form>`
 * cha gần nhất khi gọi từ một component con — đặt nó ở đây, dùng như một nút
 * bấm bình thường bên trong `<form action={...}>` của Server Component.
 */
export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" state={pending ? 'loading' : 'idle'} {...props}>
      {children}
    </Button>
  )
}
