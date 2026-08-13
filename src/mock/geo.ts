import type {
  AiEngine,
  CitationCheck,
  LlmsTxtStatus,
  PageCitabilityScore,
  TrackedPrompt,
  VisibilityShare,
} from '@/lib/domain/geo'
import { AI_ENGINES } from '@/lib/domain/geo'
import { createRandom, randomBetween } from './random'

/**
 * Dữ liệu mẫu cho AI Visibility (GEO / AIO).
 *
 * Khác biệt cốt lõi so với SEO: không có "thứ hạng". Một câu hỏi chỉ có hai kết
 * cục — được nhắc hoặc không — cộng thêm việc AI nói gì về mình và ai xuất hiện
 * cùng. Đó là lý do module này có bảng riêng, không dùng chung `metrics_daily`.
 */

export const MOCK_TRACKED_PROMPTS: readonly TrackedPrompt[] = [
  {
    id: 'geo-prompt-1',
    siteId: 'site-nha-xinh',
    text: 'mua nội thất phòng khách ở đâu uy tín tại Việt Nam',
    intent: 'recommendation',
    engines: ['chatgpt', 'perplexity', 'google-ai-overview', 'gemini'],
    cadence: 'daily',
    enabled: true,
    createdAt: '2026-05-02T03:00:00Z',
  },
  {
    id: 'geo-prompt-2',
    siteId: 'site-nha-xinh',
    text: 'cách chọn đèn trang trí cho phòng ngủ nhỏ',
    intent: 'informational',
    engines: ['chatgpt', 'perplexity', 'google-ai-overview', 'claude'],
    cadence: 'daily',
    enabled: true,
    createdAt: '2026-05-02T03:00:00Z',
  },
  {
    id: 'geo-prompt-3',
    siteId: 'site-nha-xinh',
    text: 'Nhà Xinh Décor có tốt không',
    intent: 'comparison',
    engines: AI_ENGINES,
    cadence: 'daily',
    enabled: true,
    createdAt: '2026-05-10T03:00:00Z',
  },
  {
    id: 'geo-prompt-4',
    siteId: 'site-nha-xinh',
    text: 'thương hiệu nội thất tối giản kiểu Nhật ở TP.HCM',
    intent: 'recommendation',
    engines: ['chatgpt', 'perplexity', 'gemini'],
    cadence: 'weekly',
    enabled: true,
    createdAt: '2026-06-18T03:00:00Z',
  },
  {
    id: 'geo-prompt-5',
    siteId: 'site-nha-xinh',
    text: 'giá kệ sách gỗ tự nhiên bao nhiêu',
    intent: 'transactional',
    engines: ['chatgpt', 'perplexity'],
    cadence: 'weekly',
    enabled: false,
    createdAt: '2026-07-01T03:00:00Z',
  },
]

const COMPETITORS = ['Nội Thất Hòa Phát', 'Baya', 'UMA', 'JYSK Việt Nam', 'Index Living']

/** Được nhắc hay không phụ thuộc engine và câu hỏi — không phải ngẫu nhiên đều. */
const CITATION_RATES: Readonly<Record<string, Readonly<Partial<Record<AiEngine, number>>>>> =
  {
    'geo-prompt-1': { chatgpt: 0, perplexity: 0, 'google-ai-overview': 0, gemini: 0 },
    'geo-prompt-2': {
      chatgpt: 0.42,
      perplexity: 0.68,
      'google-ai-overview': 0.21,
      claude: 0.35,
    },
    'geo-prompt-3': {
      chatgpt: 0.94,
      perplexity: 1,
      'google-ai-overview': 0.86,
      claude: 0.9,
      gemini: 0.88,
      copilot: 0.72,
    },
    'geo-prompt-4': { chatgpt: 0.18, perplexity: 0.31, gemini: 0.12 },
    'geo-prompt-5': { chatgpt: 0.08, perplexity: 0.14 },
  }

const EXCERPTS: Readonly<Record<string, string>> = {
  'geo-prompt-2':
    'Với phòng ngủ nhỏ, nên ưu tiên đèn có ánh sáng ấm 2700K và tránh đèn thả quá thấp. Một số thương hiệu trong nước như Nhà Xinh Décor có dòng đèn tre mắt mây phù hợp không gian hẹp.',
  'geo-prompt-3':
    'Nhà Xinh Décor là thương hiệu nội thất Việt tập trung vào phong cách tối giản, được đánh giá tốt về chất lượng gỗ và dịch vụ lắp đặt, tuy nhiên danh mục còn hẹp so với các chuỗi lớn.',
  'geo-prompt-4':
    'Trong nhóm thương hiệu nội thất tối giản tại TP.HCM có thể kể đến Nhà Xinh Décor với các bộ sưu tập lấy cảm hứng Nhật Bản.',
}

export const citationChecksOf = (promptId: string): readonly CitationCheck[] => {
  const prompt = MOCK_TRACKED_PROMPTS.find((item) => item.id === promptId)
  if (!prompt) return []

  const rates = CITATION_RATES[promptId] ?? {}
  const random = createRandom(
    [...promptId].reduce((sum, char) => sum + char.charCodeAt(0), 0),
  )

  return prompt.engines.map((engine, index) => {
    const rate = rates[engine] ?? 0
    const cited = random() < rate

    return {
      id: `${promptId}-${engine}`,
      promptId,
      engine,
      checkedAt: '2026-08-12T02:00:00Z',
      date: '2026-08-12',
      cited,
      position: cited ? Math.max(1, Math.round(randomBetween(random, 1, 5))) : null,
      sentiment: cited
        ? rate > 0.8
          ? 'positive'
          : 'neutral'
        : null,
      excerpt: cited ? (EXCERPTS[promptId] ?? null) : null,
      citedUrl: cited ? 'https://nhaxinhdecor.vn/bo-suu-tap/phong-khach' : null,
      competitorsCited: COMPETITORS.slice(index % 2, (index % 2) + 3),
    }
  })
}

export const visibilityShares = (): readonly VisibilityShare[] =>
  AI_ENGINES.map((engine) => {
    const relevant = MOCK_TRACKED_PROMPTS.filter((prompt) =>
      prompt.engines.includes(engine),
    )
    const checks = relevant.flatMap((prompt) =>
      citationChecksOf(prompt.id).filter((check) => check.engine === engine),
    )
    const cited = checks.filter((check) => check.cited)
    const positions = cited
      .map((check) => check.position)
      .filter((value): value is number => value !== null)

    return {
      engine,
      checksRun: checks.length,
      timesCited: cited.length,
      citationRate: checks.length === 0 ? 0 : cited.length / checks.length,
      averagePosition:
        positions.length === 0
          ? null
          : positions.reduce((sum, value) => sum + value, 0) / positions.length,
      // Ước lượng phần tiếng nói: ta trên tổng ta + đối thủ được nhắc cùng.
      shareOfVoice:
        checks.length === 0
          ? 0
          : cited.length / (cited.length + COMPETITORS.length * 0.6),
    }
  })

export const MOCK_CITABILITY: readonly PageCitabilityScore[] = [
  {
    id: 'cit-1',
    siteId: 'site-nha-xinh',
    url: '/bo-suu-tap/phong-khach',
    title: 'Bộ sưu tập nội thất phòng khách',
    overall: 41,
    axes: {
      structure: 62,
      schema: 15,
      answerability: 28,
      trust: 44,
      entityClarity: 51,
      freshness: 46,
    },
    issues: [
      {
        axis: 'schema',
        severity: 'high',
        message: 'Không có JSON-LD nào trên trang danh mục.',
        fix: 'Thêm schema ItemList kèm Product cho từng sản phẩm hiển thị.',
      },
      {
        axis: 'answerability',
        severity: 'high',
        message: 'Không có đoạn trả lời trực tiếp nào đứng độc lập được.',
        fix: 'Thêm một đoạn 40–60 từ ngay dưới H1, trả lời thẳng "mua nội thất phòng khách ở đâu".',
      },
      {
        axis: 'trust',
        severity: 'medium',
        message: 'Không có tác giả, không có ngày cập nhật.',
        fix: 'Bổ sung dateModified và thông tin đơn vị chịu trách nhiệm nội dung.',
      },
    ],
    scannedAt: '2026-08-11T18:00:00Z',
  },
  {
    id: 'cit-2',
    siteId: 'site-nha-xinh',
    url: '/blog/cach-phoi-mau-phong-ngu',
    title: 'Cách phối màu phòng ngủ theo hướng nhà',
    overall: 78,
    axes: {
      structure: 88,
      schema: 71,
      answerability: 84,
      trust: 69,
      entityClarity: 74,
      freshness: 82,
    },
    issues: [
      {
        axis: 'trust',
        severity: 'medium',
        message: 'Không dẫn nguồn cho các khuyến nghị về màu sắc.',
        fix: 'Dẫn nguồn hoặc nêu cơ sở cho từng khuyến nghị.',
      },
    ],
    scannedAt: '2026-08-11T18:00:00Z',
  },
  {
    id: 'cit-3',
    siteId: 'site-nha-xinh',
    url: '/san-pham/den-tre-mat-may',
    title: 'Đèn tre mắt mây thủ công',
    overall: 66,
    axes: {
      structure: 74,
      schema: 92,
      answerability: 41,
      trust: 58,
      entityClarity: 70,
      freshness: 61,
    },
    issues: [
      {
        axis: 'answerability',
        severity: 'high',
        message: 'Mô tả sản phẩm viết theo giọng quảng cáo, không trả lời câu hỏi nào.',
        fix: 'Thêm mục hỏi đáp ngắn: kích thước, chất liệu, hợp phòng bao nhiêu m².',
      },
    ],
    scannedAt: '2026-08-11T18:00:00Z',
  },
  {
    id: 'cit-4',
    siteId: 'site-nha-xinh',
    url: '/',
    title: 'Trang chủ',
    overall: 53,
    axes: {
      structure: 58,
      schema: 64,
      answerability: 22,
      trust: 61,
      entityClarity: 48,
      freshness: 65,
    },
    issues: [
      {
        axis: 'entityClarity',
        severity: 'medium',
        message: 'Tên thương hiệu chỉ xuất hiện trong logo, không có trong văn bản.',
        fix: 'Nêu rõ tên và lĩnh vực trong đoạn mở đầu, thêm schema Organization.',
      },
    ],
    scannedAt: '2026-08-11T18:00:00Z',
  },
]

export const MOCK_LLMS_TXT: LlmsTxtStatus = {
  present: false,
  url: 'https://nhaxinhdecor.vn/llms.txt',
  lastCheckedAt: '2026-08-11T18:00:00Z',
  validSyntax: false,
  sectionsDeclared: [],
  warnings: [
    'Chưa có file llms.txt — agent đọc site phải tự suy ra cấu trúc từ HTML.',
    'Không có bản kê khai nào cho danh mục sản phẩm và chính sách đổi trả.',
  ],
}
