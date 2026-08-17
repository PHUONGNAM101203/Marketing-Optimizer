import 'server-only'

import { GoogleGenAI } from '@google/genai'
import type { AiCallParams, AiCallResult, AiContentPart, AiMessage, AiStopReason } from './ai-types'

/**
 * Dùng API `generateContent` (Google gọi là "Legacy" trong doc mới của họ —
 * KHÔNG phải nghĩa deprecated, chính Google xác nhận "generateContent remains
 * fully supported", chỉ không còn là bề mặt API được quảng bá cho code mới).
 * Chọn API này thay vì Interactions API (bề mặt mới hơn Google khuyến nghị)
 * vì Interactions API quản lý lịch sử hội thoại PHÍA SERVER Google
 * (`previous_interaction_id`) — khác mô hình vô trạng thái (tự dựng lại toàn
 * bộ mảng messages mỗi lượt gọi) mà `run-agent.ts` và hai adapter kia
 * (Anthropic/OpenAI) đều dùng. Theo `generateContent` giữ cả ba adapter nhất
 * quán một kiểu kiến trúc.
 */

const clientsByApiKey = new Map<string, GoogleGenAI>()

const getClient = (apiKey: string): GoogleGenAI => {
  const cached = clientsByApiKey.get(apiKey)
  if (cached) return cached
  const client = new GoogleGenAI({ apiKey })
  clientsByApiKey.set(apiKey, client)
  return client
}

// Gemini dùng role 'model' cho lượt AI trả lời, KHÔNG PHẢI 'assistant' như
// Anthropic/OpenAI — dịch role NGAY tại biên file này, không để rò rỉ ra
// ngoài.
const toGeminiRole = (role: AiMessage['role']): 'user' | 'model' => (role === 'assistant' ? 'model' : 'user')

const toGeminiContents = (messages: readonly AiMessage[]) =>
  messages.map((message) => ({
    role: toGeminiRole(message.role),
    parts: message.content.map((part) => {
      if (part.type === 'text') return { text: part.text }
      if (part.type === 'tool-use') return { functionCall: { id: part.id, name: part.name, args: part.input } }
      // Gemini CÓ id gọi tool riêng (`FunctionCall.id`/`FunctionResponse.id`,
      // xem comment ở nhánh tool-use bên dưới) nhưng không phải lúc nào cũng
      // trả về — khi có, `part.toolUseId` đã mang đúng id thật đó (được gán
      // ở bước parse response); khi không, nó mang tên tool (fallback). Nối
      // `id: part.toolUseId` vào đây để bất kể trường hợp nào, giá trị đã
      // dùng làm id lúc trước cũng round-trip đúng lại cho Gemini khớp lượt
      // gọi.
      return { functionResponse: { id: part.toolUseId, name: part.name, response: { result: part.content } } }
    }),
  }))

export const callGemini = async (params: AiCallParams): Promise<AiCallResult> => {
  const client = getClient(params.apiKey)

  // Web search GỐC của Gemini (`googleSearch`) — chạy phía SERVER Google
  // trong CÙNG lượt gọi, không phải tool tự định nghĩa cần round-trip. CHƯA
  // ai chạy thử với key thật — cú pháp bám theo `Tool.googleSearch` khai
  // trong SDK (`node_modules/@google/genai/dist/genai.d.ts`). Gemini được
  // biết là KHÔNG cho trộn `googleSearch` với `functionDeclarations` trong
  // cùng một lượt gọi ở một số phiên bản API — không phải vấn đề ở đây vì
  // nơi gọi duy nhất bật `enableWebSearch` (kiểm tra trích dẫn) không đồng
  // thời truyền `tools` tự định nghĩa nào.
  const tools =
    params.enableWebSearch
      ? [{ googleSearch: {} }]
      : params.tools && params.tools.length > 0
        ? [
            {
              functionDeclarations: params.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                // `parametersJsonSchema` chấp nhận JSON Schema thuần — tool
                // registry (`agents/tools.ts`) đã viết theo JSON Schema sẵn,
                // dùng trực tiếp thay vì dịch sang format OpenAPI-subset
                // riêng của Gemini (`Type` enum).
                parametersJsonSchema: tool.inputSchema,
              })),
            },
          ]
        : undefined

  const response = await client.models.generateContent({
    model: params.model,
    contents: toGeminiContents(params.messages),
    config: {
      systemInstruction: params.systemPrompt,
      tools,
      maxOutputTokens: params.maxTokens ?? 8000,
    },
  })

  const candidate = response.candidates?.[0]
  const rawParts = candidate?.content?.parts ?? []
  const content: AiContentPart[] = []
  for (const part of rawParts) {
    if (part.text) content.push({ type: 'text', text: part.text })
    if (part.functionCall?.name) {
      content.push({
        type: 'tool-use',
        // Gemini CÓ trả id riêng cho lượt gọi tool (`FunctionCall.id`, khớp
        // với `FunctionResponse.id` — xác nhận qua type thật của
        // `@google/genai@2.17.1`), nhưng field này optional và không phải
        // lúc nào response cũng điền — ưu tiên id thật khi có, chỉ fallback
        // về tên tool khi Gemini bỏ trống. Fallback-bằng-tên chỉ đúng nếu
        // MỘT round không gọi CÙNG một tool hai lần — hợp lý với thiết kế
        // agent hiện tại (mỗi round thường gọi mỗi tool tối đa 1 lần).
        id: part.functionCall.id ?? part.functionCall.name,
        name: part.functionCall.name,
        input: (part.functionCall.args ?? {}) as Record<string, unknown>,
      })
    }
  }

  const hasToolUse = content.some((part) => part.type === 'tool-use')
  const finishReason = candidate?.finishReason

  // Không có finishReason riêng cho "muốn gọi tool" trong Gemini — model vẫn
  // báo STOP khi trả về functionCall, nên phát hiện bằng nội dung trả về
  // (hasToolUse), không phải finishReason, giống hệt lý do ở openai.ts.
  const stopReason: AiStopReason = hasToolUse
    ? 'tool_use'
    : finishReason === 'MAX_TOKENS'
      ? 'max_tokens'
      : finishReason === 'STOP'
        ? 'end_turn'
        : 'other'

  return {
    content,
    stopReason,
    tokensIn: response.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: response.usageMetadata?.candidatesTokenCount ?? 0,
    // Gemini không đảm bảo trả lại tên model đã dùng trong response — echo
    // lại đúng model đã gửi lên thay vì đoán một field response có thể không
    // tồn tại.
    model: params.model,
  }
}

/**
 * `ai.models.list()` trả về `Promise<Pager<Model>>` — PHẢI await một lần lấy
 * Pager rồi mới `for await` lặp qua Pager đó (khác Anthropic/OpenAI, list()
 * của hai hãng kia tự async-iterable, không cần await trước). Field định
 * danh model là `.name` dạng `"models/{id}"`, KHÔNG phải `.id` — bỏ tiền tố
 * trước khi lưu/hiện. Lọc `supportedActions.includes('generateContent')` để
 * loại model chỉ hỗ trợ embedContent (embedding) — field JS SDK đổi tên từ
 * `supportedGenerationMethods` bên REST, xác nhận qua source SDK đã decompile,
 * không phải suy đoán từ doc REST.
 */
export const listGeminiModels = async (apiKey: string): Promise<readonly string[]> => {
  const client = getClient(apiKey)
  const pager = await client.models.list()
  const ids: string[] = []
  for await (const model of pager) {
    if (model.name && model.supportedActions?.includes('generateContent')) {
      ids.push(model.name.replace(/^models\//, ''))
    }
  }
  // Gemini không công bố thứ tự trả về — sắp alphabet cho dropdown ổn định.
  return ids.sort()
}
