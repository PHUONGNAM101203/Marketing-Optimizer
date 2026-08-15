/**
 * Prompt Studio.
 *
 * Mọi tác vụ AI trong app lấy prompt từ đây — không có prompt nào nằm rải rác
 * trong code. Lý do: prompt là thứ cần sửa thường xuyên nhất và cần biết ai sửa,
 * sửa lúc nào, bản trước ra sao. Chôn nó trong file .ts là mất hết những thứ đó.
 */

export interface PromptTemplate {
  readonly id: string
  readonly siteId: string
  readonly name: string
  readonly description: string
  readonly category: PromptCategory
  /** Bản đang được dùng. Lịch sử nằm ở `versions`. */
  readonly currentVersionId: string
  readonly versions: readonly PromptVersion[]
  readonly variables: readonly PromptVariable[]
  readonly tags: readonly string[]
  readonly updatedAt: string
}

export type PromptCategory =
  | 'ad-copy'
  | 'seo-content'
  | 'analysis'
  | 'planning'
  | 'reporting'
  | 'email'
  | 'social'
  | 'geo'

export const PROMPT_CATEGORY_LABELS: Readonly<Record<PromptCategory, string>> = {
  'ad-copy': 'Nội dung quảng cáo',
  'seo-content': 'Nội dung SEO',
  analysis: 'Phân tích',
  planning: 'Lập kế hoạch',
  reporting: 'Báo cáo',
  email: 'Email',
  social: 'Mạng xã hội',
  geo: 'AI Visibility',
}

export interface PromptVersion {
  readonly id: string
  readonly promptId: string
  readonly version: number
  readonly systemPrompt: string
  readonly userTemplate: string
  readonly notes: string | null
  readonly createdBy: string
  readonly createdAt: string
}

/**
 * Biến chèn vào template bằng cú pháp `{{tên}}`.
 * `source` cho biết giá trị lấy từ đâu — biến `metric` và `entity` được điền
 * tự động từ dữ liệu Site, nên prompt không bao giờ phải bịa số.
 */
export interface PromptVariable {
  readonly name: string
  readonly label: string
  readonly source: PromptVariableSource
  readonly required: boolean
  readonly defaultValue: string | null
  readonly description: string
}

export type PromptVariableSource =
  /** Người dùng gõ tay khi chạy. */
  | 'manual'
  /** Điền từ thông tin Site: domain, ngành, đối tượng. */
  | 'site'
  /** Điền từ `metrics_daily` — số thật, không phải số mô hình tự nghĩ ra. */
  | 'metric'
  /** Điền từ bảng `entities`: tên campaign, tên trang. */
  | 'entity'

export const VARIABLE_SOURCE_LABELS: Readonly<Record<PromptVariableSource, string>> = {
  manual: 'Nhập tay',
  site: 'Từ Site',
  metric: 'Từ số liệu',
  entity: 'Từ thực thể',
}

/** Một lần chạy thử, để so bản mới với bản cũ trước khi đổi bản đang dùng. */
export interface PromptRun {
  readonly id: string
  readonly promptId: string
  readonly versionId: string
  readonly inputs: Readonly<Record<string, string>>
  readonly output: string
  readonly model: string
  readonly tokensIn: number
  readonly tokensOut: number
  readonly latencyMs: number
  readonly rating: 1 | 2 | 3 | 4 | 5 | null
  readonly ranBy: string
  readonly ranAt: string
}

/** Xuất ra để nơi khác (vd. thay thế biến lúc chạy thử) khớp đúng cùng độ
 * dung sai khoảng trắng với bước rút tên biến — không tự dựng lại pattern. */
export const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/** Rút tên biến từ template — dùng để cảnh báo biến thiếu khai báo. */
export const extractVariableNames = (template: string): readonly string[] => {
  const found = new Set<string>()
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    const name = match[1]
    if (name) found.add(name)
  }
  return [...found]
}

/** Biến xuất hiện trong template nhưng chưa được khai báo. */
export const findUndeclaredVariables = (
  template: string,
  declared: readonly PromptVariable[],
): readonly string[] => {
  const declaredNames = new Set(declared.map((variable) => variable.name))
  return extractVariableNames(template).filter((name) => !declaredNames.has(name))
}
