import type { PromptRun, PromptTemplate } from '@/lib/domain/prompt'

/**
 * Thư viện prompt.
 *
 * Chú ý `source` của từng biến: `metric` và `entity` được điền TỰ ĐỘNG từ dữ
 * liệu Site. Đó là cách chặn mô hình bịa số ngay ở tầng prompt — nó không phải
 * tự nghĩ ra con số nào, số đã nằm sẵn trong ngữ cảnh.
 */
export const MOCK_PROMPTS: readonly PromptTemplate[] = [
  {
    id: 'prompt-ads-audit',
    siteId: 'site-nha-xinh',
    name: 'Rà hiệu quả chiến dịch',
    description:
      'So CPA từng chiến dịch với trung bình tài khoản, chỉ ra chiến dịch nên cắt và chiến dịch nên tăng.',
    category: 'analysis',
    currentVersionId: 'prompt-ads-audit-v3',
    versions: [
      {
        id: 'prompt-ads-audit-v3',
        promptId: 'prompt-ads-audit',
        version: 3,
        systemPrompt:
          'Bạn là chuyên viên tối ưu quảng cáo. Chỉ dùng số liệu được cung cấp trong ngữ cảnh. Nếu một con số không có trong ngữ cảnh, nói rõ là không có — tuyệt đối không ước lượng.',
        userTemplate:
          'Website: {{domain}}\nKhoảng ngày: {{dateRange}}\nCPA trung bình tài khoản: {{accountCpa}}\n\nDữ liệu chiến dịch:\n{{campaignTable}}\n\nChỉ ra tối đa 3 chiến dịch nên điều chỉnh ngân sách. Với mỗi chiến dịch nêu: tên, mức điều chỉnh đề xuất, và con số cụ thể làm căn cứ.',
        notes: 'Thêm ràng buộc cấm ước lượng sau khi v2 tự bịa tỉ lệ hiển thị mất.',
        createdBy: 'Phương Nam',
        createdAt: '2026-07-28T04:00:00Z',
      },
      {
        id: 'prompt-ads-audit-v2',
        promptId: 'prompt-ads-audit',
        version: 2,
        systemPrompt: 'Bạn là chuyên viên tối ưu quảng cáo.',
        userTemplate:
          'Website: {{domain}}\nDữ liệu chiến dịch:\n{{campaignTable}}\n\nChiến dịch nào nên tăng, chiến dịch nào nên giảm?',
        notes: null,
        createdBy: 'Phương Nam',
        createdAt: '2026-06-14T04:00:00Z',
      },
    ],
    variables: [
      {
        name: 'domain',
        label: 'Tên miền',
        source: 'site',
        required: true,
        defaultValue: null,
        description: 'Tên miền của Site đang mở.',
      },
      {
        name: 'dateRange',
        label: 'Khoảng ngày',
        source: 'site',
        required: true,
        defaultValue: null,
        description: 'Khoảng ngày đang chọn trên topbar.',
      },
      {
        name: 'accountCpa',
        label: 'CPA trung bình',
        source: 'metric',
        required: true,
        defaultValue: null,
        description: 'Lấy trực tiếp từ metrics_daily, không do mô hình tính.',
      },
      {
        name: 'campaignTable',
        label: 'Bảng chiến dịch',
        source: 'entity',
        required: true,
        defaultValue: null,
        description: 'Bảng markdown gồm tên, chi phí, chuyển đổi, CPA, ROAS từng chiến dịch.',
      },
    ],
    tags: ['google-ads', 'meta-ads', 'ngân sách'],
    updatedAt: '2026-07-28T04:00:00Z',
  },
  {
    id: 'prompt-seo-drop',
    siteId: 'site-nha-xinh',
    name: 'Phân tích truy vấn rớt hạng',
    description: 'Đối chiếu truy vấn rớt hạng với nội dung trang đích để đoán nguyên nhân.',
    category: 'seo-content',
    currentVersionId: 'prompt-seo-drop-v1',
    versions: [
      {
        id: 'prompt-seo-drop-v1',
        promptId: 'prompt-seo-drop',
        version: 1,
        systemPrompt:
          'Bạn là chuyên viên SEO. Phân biệt rõ nguyên nhân kỹ thuật với nguyên nhân cạnh tranh. Không kết luận chắc chắn khi dữ liệu chỉ đủ để phỏng đoán.',
        userTemplate:
          'Truy vấn: {{query}}\nVị trí trước: {{positionBefore}} → nay: {{positionAfter}}\nHiển thị: {{impressions}}\nNội dung trang đích:\n{{pageContent}}\n\nNguyên nhân khả dĩ là gì, và cần kiểm chứng thêm điều gì?',
        notes: null,
        createdBy: 'Trần Khánh Vy',
        createdAt: '2026-06-02T04:00:00Z',
      },
    ],
    variables: [
      {
        name: 'query',
        label: 'Truy vấn',
        source: 'entity',
        required: true,
        defaultValue: null,
        description: 'Truy vấn từ Search Console.',
      },
      {
        name: 'positionBefore',
        label: 'Vị trí trước',
        source: 'metric',
        required: true,
        defaultValue: null,
        description: 'Vị trí trung bình kỳ trước.',
      },
      {
        name: 'positionAfter',
        label: 'Vị trí sau',
        source: 'metric',
        required: true,
        defaultValue: null,
        description: 'Vị trí trung bình kỳ này.',
      },
      {
        name: 'impressions',
        label: 'Hiển thị',
        source: 'metric',
        required: false,
        defaultValue: '0',
        description: 'Số lần hiển thị trong kỳ.',
      },
      {
        name: 'pageContent',
        label: 'Nội dung trang',
        source: 'manual',
        required: false,
        defaultValue: null,
        description: 'Văn bản trang đích, agent tự lấy khi chạy.',
      },
    ],
    tags: ['gsc', 'nội dung'],
    updatedAt: '2026-06-02T04:00:00Z',
  },
  {
    id: 'prompt-geo-check',
    siteId: 'site-nha-xinh',
    name: 'Chấm khả năng được AI trích dẫn',
    description:
      'Chấm một trang theo sáu trục citability và chỉ ra sửa gì để được AI trích dẫn.',
    category: 'geo',
    currentVersionId: 'prompt-geo-check-v2',
    versions: [
      {
        id: 'prompt-geo-check-v2',
        promptId: 'prompt-geo-check',
        version: 2,
        systemPrompt:
          'Bạn chấm khả năng một trang web được mô hình ngôn ngữ trích dẫn. Chấm theo sáu trục: cấu trúc, schema, khả năng trả lời, độ tin cậy, rõ thực thể, độ mới. Mỗi trục 0–100 kèm lý do cụ thể trích từ nội dung trang.',
        userTemplate:
          'URL: {{url}}\nCâu hỏi mục tiêu: {{targetPrompt}}\n\nNội dung trang:\n{{pageContent}}\n\nChấm sáu trục và liệt kê tối đa 5 việc cần sửa, xếp theo mức tác động.',
        notes: 'v2 buộc trích dẫn nguyên văn từ trang làm căn cứ cho mỗi điểm số.',
        createdBy: 'Phương Nam',
        createdAt: '2026-07-20T04:00:00Z',
      },
      {
        id: 'prompt-geo-check-v1',
        promptId: 'prompt-geo-check',
        version: 1,
        systemPrompt: 'Bạn chấm khả năng một trang web được AI trích dẫn.',
        userTemplate: 'URL: {{url}}\nNội dung:\n{{pageContent}}\n\nChấm điểm và góp ý.',
        notes: null,
        createdBy: 'Phương Nam',
        createdAt: '2026-07-05T04:00:00Z',
      },
    ],
    variables: [
      {
        name: 'url',
        label: 'URL',
        source: 'manual',
        required: true,
        defaultValue: null,
        description: 'Trang cần chấm.',
      },
      {
        name: 'targetPrompt',
        label: 'Câu hỏi mục tiêu',
        source: 'manual',
        required: true,
        defaultValue: null,
        description: 'Câu hỏi mà trang này muốn được trích dẫn khi có người hỏi.',
      },
      {
        name: 'pageContent',
        label: 'Nội dung trang',
        source: 'manual',
        required: true,
        defaultValue: null,
        description: 'Văn bản đã bóc tách của trang.',
      },
    ],
    tags: ['geo', 'aio', 'nội dung'],
    updatedAt: '2026-07-20T04:00:00Z',
  },
  {
    id: 'prompt-weekly-report',
    siteId: 'site-nha-xinh',
    name: 'Báo cáo tuần',
    description: 'Tổng hợp hiệu suất toàn kênh thành báo cáo tuần cho người không chuyên.',
    category: 'reporting',
    currentVersionId: 'prompt-weekly-report-v1',
    versions: [
      {
        id: 'prompt-weekly-report-v1',
        promptId: 'prompt-weekly-report',
        version: 1,
        systemPrompt:
          'Viết cho người không làm marketing. Mỗi con số nêu ra phải kèm ngữ cảnh so sánh. Không dùng từ hoa mỹ, không kết luận vượt quá dữ liệu.',
        userTemplate:
          'Tuần: {{dateRange}}\nSố liệu toàn kênh:\n{{channelTable}}\nThay đổi đáng chú ý:\n{{notableChanges}}\n\nViết báo cáo 300–400 từ: tuần này ra sao, cái gì đổi, cần chú ý gì tuần tới.',
        notes: null,
        createdBy: 'Trần Khánh Vy',
        createdAt: '2026-05-19T04:00:00Z',
      },
    ],
    variables: [
      {
        name: 'dateRange',
        label: 'Khoảng ngày',
        source: 'site',
        required: true,
        defaultValue: null,
        description: 'Tuần báo cáo.',
      },
      {
        name: 'channelTable',
        label: 'Bảng kênh',
        source: 'metric',
        required: true,
        defaultValue: null,
        description: 'Số liệu từng kênh trong tuần.',
      },
      {
        name: 'notableChanges',
        label: 'Thay đổi đáng chú ý',
        source: 'metric',
        required: false,
        defaultValue: null,
        description: 'Danh sách insight đã phát hiện trong tuần.',
      },
    ],
    tags: ['báo cáo'],
    updatedAt: '2026-05-19T04:00:00Z',
  },
  {
    id: 'prompt-ad-copy',
    siteId: 'site-nha-xinh',
    name: 'Sinh biến thể nội dung quảng cáo',
    description: 'Tạo tiêu đề và mô tả cho Responsive Search Ads từ trang đích.',
    category: 'ad-copy',
    currentVersionId: 'prompt-ad-copy-v1',
    versions: [
      {
        id: 'prompt-ad-copy-v1',
        promptId: 'prompt-ad-copy',
        version: 1,
        systemPrompt:
          'Viết nội dung quảng cáo tiếng Việt. Tiêu đề tối đa 30 ký tự, mô tả tối đa 90 ký tự — đếm cả dấu. Không hứa hẹn điều không có trên trang đích.',
        userTemplate:
          'Trang đích: {{url}}\nNội dung trang:\n{{pageContent}}\nTừ khoá chính: {{keywords}}\n\nViết 15 tiêu đề và 4 mô tả. Đánh dấu biến thể nào nhắm ý định nào.',
        notes: null,
        createdBy: 'Trần Khánh Vy',
        createdAt: '2026-07-11T04:00:00Z',
      },
    ],
    variables: [
      {
        name: 'url',
        label: 'Trang đích',
        source: 'manual',
        required: true,
        defaultValue: null,
        description: 'URL trang đích của quảng cáo.',
      },
      {
        name: 'pageContent',
        label: 'Nội dung trang',
        source: 'manual',
        required: true,
        defaultValue: null,
        description: 'Văn bản trang đích.',
      },
      {
        name: 'keywords',
        label: 'Từ khoá',
        source: 'entity',
        required: true,
        defaultValue: null,
        description: 'Từ khoá của nhóm quảng cáo.',
      },
    ],
    tags: ['google-ads', 'nội dung'],
    updatedAt: '2026-07-11T04:00:00Z',
  },
]

export const MOCK_PROMPT_RUNS: readonly PromptRun[] = [
  {
    id: 'prun-1',
    promptId: 'prompt-ads-audit',
    versionId: 'prompt-ads-audit-v3',
    inputs: { domain: 'nhaxinhdecor.vn', dateRange: '15/07 – 11/08/2026' },
    output:
      '1. Search — Từ khoá chung: giảm 30% ngân sách. CPA 512.000 ₫ so với trung bình tài khoản 196.990 ₫.\n2. Search — Nội thất phòng khách: tăng 13% ngân sách. CPA 149.700 ₫, chạm trần ngân sách 7/28 ngày.\n3. Display — Remarketing: đang tạm dừng, không đề xuất gì.',
    model: 'claude-opus-5',
    tokensIn: 4_820,
    tokensOut: 612,
    latencyMs: 6_340,
    rating: 5,
    ranBy: 'Phương Nam',
    ranAt: '2026-08-11T09:20:00Z',
  },
  {
    id: 'prun-2',
    promptId: 'prompt-ads-audit',
    versionId: 'prompt-ads-audit-v2',
    inputs: { domain: 'nhaxinhdecor.vn' },
    output:
      'Nên tăng ngân sách cho các chiến dịch đang hiệu quả và giảm ở chiến dịch kém. Tỉ lệ hiển thị mất do ngân sách khoảng 25%.',
    model: 'claude-opus-5',
    tokensIn: 2_140,
    tokensOut: 188,
    latencyMs: 2_910,
    rating: 2,
    ranBy: 'Phương Nam',
    ranAt: '2026-07-27T15:04:00Z',
  },
]

export const promptsOfSite = (_siteId: string): readonly PromptTemplate[] =>
  MOCK_PROMPTS

export const findPrompt = (promptId: string): PromptTemplate | undefined =>
  MOCK_PROMPTS.find((prompt) => prompt.id === promptId)

export const runsOfPrompt = (promptId: string): readonly PromptRun[] =>
  MOCK_PROMPT_RUNS.filter((run) => run.promptId === promptId)
