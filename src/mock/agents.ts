import type { Agent, AgentRun, PendingAction } from '@/lib/domain/agent'

/**
 * Agent và lịch sử chạy.
 *
 * Chú ý `pendingActions` ở run-2: agent đã phân tích xong và ĐỀ XUẤT đổi ngân
 * sách, nhưng run dừng ở `pending-approval` chứ không tự thực thi. Đây là bất
 * biến an toàn của cả module — dữ liệu mẫu phải thể hiện đúng nó, vì nếu mẫu
 * cho phép agent tự chạy hành động ghi thì màn hình sẽ được thiết kế quanh giả
 * định sai.
 */

export const MOCK_AGENTS: readonly Agent[] = [
  {
    id: 'agent-ads',
    siteId: 'site-nha-xinh',
    role: 'ads-optimizer',
    name: 'Trực ngân sách quảng cáo',
    description:
      'Rà chi phí và CPA từng chiến dịch mỗi sáng, đề xuất chuyển ngân sách khi chênh lệch hiệu quả vượt ngưỡng.',
    promptId: 'prompt-ads-audit',
    tools: [
      { name: 'query-metrics', provider: null, enabled: true },
      { name: 'list-entities', provider: null, enabled: true },
      { name: 'compare-periods', provider: null, enabled: true },
      { name: 'apply-budget-change', provider: 'google-ads', enabled: true },
      { name: 'pause-campaign', provider: 'meta-ads', enabled: false },
    ],
    schedule: { cadence: 'daily', hourOfDay: 7, dayOfWeek: null },
    enabled: true,
    lastRunAt: '2026-08-12T00:05:00Z',
  },
  {
    id: 'agent-seo',
    siteId: 'site-nha-xinh',
    role: 'seo-analyst',
    name: 'Canh thứ hạng tìm kiếm',
    description:
      'Theo dõi truy vấn rớt hạng trong Search Console và đối chiếu với thay đổi nội dung trên trang.',
    promptId: 'prompt-seo-drop',
    tools: [
      { name: 'read-search-queries', provider: 'gsc', enabled: true },
      { name: 'fetch-page-content', provider: null, enabled: true },
      { name: 'compare-periods', provider: null, enabled: true },
    ],
    schedule: { cadence: 'daily', hourOfDay: 6, dayOfWeek: null },
    enabled: true,
    lastRunAt: '2026-08-12T00:02:00Z',
  },
  {
    id: 'agent-geo',
    siteId: 'site-nha-xinh',
    role: 'ai-visibility-tracker',
    name: 'Theo dõi hiện diện AI',
    description:
      'Hỏi các engine AI theo bộ câu hỏi đã đăng ký, ghi nhận thương hiệu có được trích dẫn không và đối thủ nào xuất hiện cùng.',
    promptId: 'prompt-geo-check',
    tools: [
      { name: 'check-ai-citation', provider: null, enabled: true },
      { name: 'fetch-page-content', provider: null, enabled: true },
    ],
    schedule: { cadence: 'daily', hourOfDay: 2, dayOfWeek: null },
    enabled: true,
    lastRunAt: '2026-08-12T02:00:00Z',
  },
  {
    id: 'agent-report',
    siteId: 'site-nha-xinh',
    role: 'report-writer',
    name: 'Soạn báo cáo tuần',
    description:
      'Tổng hợp hiệu suất toàn kênh thành báo cáo tuần, nêu rõ cái gì đổi và vì sao.',
    promptId: 'prompt-weekly-report',
    tools: [
      { name: 'query-metrics', provider: null, enabled: true },
      { name: 'compare-periods', provider: null, enabled: true },
      { name: 'publish-report', provider: null, enabled: true },
    ],
    schedule: { cadence: 'weekly', hourOfDay: 8, dayOfWeek: 1 },
    enabled: false,
    lastRunAt: '2026-08-04T01:00:00Z',
  },
]

export const MOCK_PENDING_ACTIONS: readonly PendingAction[] = [
  {
    id: 'action-1',
    runId: 'run-2',
    tool: 'apply-budget-change',
    actionKind: 'shift-budget',
    provider: 'google-ads',
    targetEntityId: 'google-ads-entity-4',
    targetEntityName: 'Search — Từ khoá chung',
    summary: 'Giảm ngân sách ngày từ 1.400.000 ₫ xuống 980.000 ₫',
    diff: [
      { field: 'Ngân sách ngày', before: '1.400.000 ₫', after: '980.000 ₫' },
      { field: 'Chiến lược giá thầu', before: 'Tối đa hoá nhấp', after: 'Tối đa hoá chuyển đổi' },
    ],
    rationale:
      'CPA của chiến dịch này là 512.000 ₫, cao gấp 2,6 lần trung bình tài khoản trong 28 ngày. Phần ngân sách cắt ra đủ để gỡ giới hạn cho "Search — Nội thất phòng khách", nơi CPA thấp hơn trung bình 24%.',
    decidedBy: null,
    decidedAt: null,
    decision: null,
  },
  {
    id: 'action-2',
    runId: 'run-2',
    tool: 'apply-budget-change',
    actionKind: 'adjust-budget',
    provider: 'google-ads',
    targetEntityId: 'google-ads-entity-1',
    targetEntityName: 'Search — Nội thất phòng khách',
    summary: 'Tăng ngân sách ngày từ 3.200.000 ₫ lên 3.620.000 ₫',
    diff: [{ field: 'Ngân sách ngày', before: '3.200.000 ₫', after: '3.620.000 ₫' }],
    rationale:
      'Chiến dịch chạm trần ngân sách 7 trong 28 ngày gần nhất, tỉ lệ hiển thị mất do ngân sách là 18%.',
    decidedBy: null,
    decidedAt: null,
    decision: null,
  },
]

export const MOCK_RUNS: readonly AgentRun[] = [
  {
    id: 'run-1',
    agentId: 'agent-geo',
    siteId: 'site-nha-xinh',
    status: 'succeeded',
    trigger: 'schedule',
    steps: [
      {
        index: 0,
        kind: 'thought',
        tool: null,
        content: 'Có 4 câu hỏi đang bật ở nhịp hằng ngày. Chạy lần lượt trên từng engine đã đăng ký.',
        at: '2026-08-12T02:00:04Z',
      },
      {
        index: 1,
        kind: 'tool-call',
        tool: 'check-ai-citation',
        content: 'check-ai-citation({ promptId: "geo-prompt-1", engines: 4 })',
        at: '2026-08-12T02:00:06Z',
      },
      {
        index: 2,
        kind: 'tool-result',
        tool: 'check-ai-citation',
        content: '0/4 engine nhắc tới thương hiệu. 3 đối thủ xuất hiện ở cả 4 câu trả lời.',
        at: '2026-08-12T02:01:12Z',
      },
      {
        index: 3,
        kind: 'tool-call',
        tool: 'fetch-page-content',
        content: 'fetch-page-content({ url: "/bo-suu-tap/phong-khach" })',
        at: '2026-08-12T02:01:14Z',
      },
      {
        index: 4,
        kind: 'tool-result',
        tool: 'fetch-page-content',
        content: 'Không tìm thấy JSON-LD. Không có đoạn trả lời trực tiếp trong 300 từ đầu.',
        at: '2026-08-12T02:01:20Z',
      },
      {
        index: 5,
        kind: 'output',
        tool: null,
        content:
          'Ghi nhận 1 khoảng trống hiện diện AI ở câu "mua nội thất phòng khách ở đâu". Nguyên nhân khả dĩ: trang danh mục thiếu schema và thiếu đoạn trả lời trực tiếp.',
        at: '2026-08-12T02:01:22Z',
      },
    ],
    pendingActions: [],
    summary:
      'Chạy 14 lượt kiểm tra trên 5 engine. Phát hiện 1 khoảng trống mới, không có hành động ghi nào cần duyệt.',
    startedAt: '2026-08-12T02:00:00Z',
    finishedAt: '2026-08-12T02:01:22Z',
    tokensUsed: 18_420,
  },
  {
    id: 'run-2',
    agentId: 'agent-ads',
    siteId: 'site-nha-xinh',
    status: 'pending-approval',
    trigger: 'schedule',
    steps: [
      {
        index: 0,
        kind: 'thought',
        tool: null,
        content: 'So CPA từng chiến dịch với trung bình tài khoản trong 28 ngày.',
        at: '2026-08-12T00:05:02Z',
      },
      {
        index: 1,
        kind: 'tool-call',
        tool: 'query-metrics',
        content: 'query-metrics({ provider: "google-ads", groupBy: "campaign", days: 28 })',
        at: '2026-08-12T00:05:03Z',
      },
      {
        index: 2,
        kind: 'tool-result',
        tool: 'query-metrics',
        content: '6 chiến dịch. CPA trung bình 196.990 ₫. Cao nhất 512.000 ₫, thấp nhất 149.700 ₫.',
        at: '2026-08-12T00:05:41Z',
      },
      {
        index: 3,
        kind: 'thought',
        tool: null,
        content:
          'Chênh lệch 3,4 lần giữa chiến dịch tốt nhất và tệ nhất, vượt ngưỡng 2 lần. Đề xuất chuyển ngân sách. Đây là hành động GHI nên phải dừng chờ duyệt.',
        at: '2026-08-12T00:05:44Z',
      },
      {
        index: 4,
        kind: 'output',
        tool: null,
        content: 'Chuẩn bị 2 thay đổi ngân sách, chờ người duyệt trước khi gọi API Google Ads.',
        at: '2026-08-12T00:05:46Z',
      },
    ],
    pendingActions: MOCK_PENDING_ACTIONS,
    summary: '2 thay đổi ngân sách đang chờ duyệt. Chưa có gì được gửi sang Google Ads.',
    startedAt: '2026-08-12T00:05:00Z',
    finishedAt: null,
    tokensUsed: 24_180,
  },
  {
    id: 'run-3',
    agentId: 'agent-seo',
    siteId: 'site-nha-xinh',
    status: 'succeeded',
    trigger: 'schedule',
    steps: [
      {
        index: 0,
        kind: 'tool-call',
        tool: 'read-search-queries',
        content: 'read-search-queries({ days: 28, minImpressions: 500 })',
        at: '2026-08-12T00:02:03Z',
      },
      {
        index: 1,
        kind: 'tool-result',
        tool: 'read-search-queries',
        content: '212 truy vấn. 1 truy vấn rớt hơn 5 bậc: "đèn trang trí phòng ngủ" (4,2 → 10,1).',
        at: '2026-08-12T00:02:29Z',
      },
      {
        index: 2,
        kind: 'output',
        tool: null,
        content:
          'Trang đích không đổi trong 60 ngày. Rớt hạng nhiều khả năng do đối thủ cập nhật nội dung, không phải lỗi kỹ thuật.',
        at: '2026-08-12T00:02:34Z',
      },
    ],
    pendingActions: [],
    summary: '1 truy vấn rớt hạng đáng chú ý. Không có hành động ghi.',
    startedAt: '2026-08-12T00:02:00Z',
    finishedAt: '2026-08-12T00:02:34Z',
    tokensUsed: 9_640,
  },
  {
    id: 'run-4',
    agentId: 'agent-ads',
    siteId: 'site-nha-xinh',
    status: 'failed',
    trigger: 'schedule',
    steps: [
      {
        index: 0,
        kind: 'tool-call',
        tool: 'query-metrics',
        content: 'query-metrics({ provider: "tiktok", groupBy: "campaign", days: 28 })',
        at: '2026-08-11T00:05:03Z',
      },
      {
        index: 1,
        kind: 'tool-result',
        tool: 'query-metrics',
        content: 'Lỗi: REFRESH_TOKEN_EXPIRED — kết nối TikTok hết hạn từ 29/07.',
        at: '2026-08-11T00:05:05Z',
      },
    ],
    pendingActions: [],
    summary: 'Dừng vì kết nối TikTok hết hạn. Cần cấp quyền lại trước khi chạy tiếp.',
    startedAt: '2026-08-11T00:05:00Z',
    finishedAt: '2026-08-11T00:05:06Z',
    tokensUsed: 1_210,
  },
]

export const agentsOfSite = (_siteId: string): readonly Agent[] => MOCK_AGENTS

export const runsOfSite = (_siteId: string): readonly AgentRun[] => MOCK_RUNS

export const runsOfAgent = (agentId: string): readonly AgentRun[] =>
  MOCK_RUNS.filter((run) => run.agentId === agentId)

export const pendingActionsOfSite = (siteId: string): readonly PendingAction[] =>
  runsOfSite(siteId).flatMap((run) => run.pendingActions)

export const findAgent = (agentId: string): Agent | undefined =>
  MOCK_AGENTS.find((agent) => agent.id === agentId)
