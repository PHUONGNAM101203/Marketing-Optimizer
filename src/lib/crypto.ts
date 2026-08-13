import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { cryptoEnv } from '@/lib/supabase/env'

/**
 * Mã hoá token OAuth ở tầng ứng dụng, AES-256-GCM.
 *
 * Khoá nằm trong biến môi trường, KHÔNG nằm trong database — kẻ tấn công đọc
 * được toàn bộ database (kể cả bản backup) vẫn không giải mã được token. Đây
 * là lớp phòng thủ thứ hai sau RLS/không-policy của `connection_secrets`, chứ
 * không thay thế nó.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

export const encrypt = (plaintext: string): string => {
  const { TOKEN_ENCRYPTION_KEY } = cryptoEnv()
  const key = Buffer.from(TOKEN_ENCRYPTION_KEY, 'base64')
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
    '.',
  )
}

export const decrypt = (payload: string): string => {
  const { TOKEN_ENCRYPTION_KEY } = cryptoEnv()
  const key = Buffer.from(TOKEN_ENCRYPTION_KEY, 'base64')

  const [ivB64, authTagB64, ciphertextB64] = payload.split('.')
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Định dạng payload mã hoá không hợp lệ')
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ])

  return plaintext.toString('utf8')
}
