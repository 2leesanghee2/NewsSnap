/**
 * 카테고리 분류기
 * 텍스트 내 키워드 매칭 빈도를 기반으로
 * AI / Tech / Business / Design 중 하나를 반환한다.
 */

const RULES = [
  {
    category: "AI",
    keywords: [
      "artificial intelligence", "machine learning", "deep learning",
      "neural network", "large language model", "llm", "generative ai",
      "gpt", "chatgpt", "openai", "anthropic", "gemini", "llama",
      "transformer", "diffusion", "reinforcement learning", "nlp",
      "computer vision", "autonomous", "robotics", "자동화", "인공지능",
    ],
  },
  {
    category: "Tech",
    keywords: [
      "software", "hardware", "developer", "programming", "cloud",
      "kubernetes", "docker", "open source", "github", "api",
      "cybersecurity", "semiconductor", "chip", "server", "data center",
      "smartphone", "5g", "quantum", "blockchain", "metaverse",
      "apple", "google", "samsung", "microsoft", "amazon", "meta",
      "반도체", "기술", "개발", "클라우드", "보안",
    ],
  },
  {
    category: "Business",
    keywords: [
      "startup", "investment", "funding", "revenue", "profit", "ipo",
      "merger", "acquisition", "valuation", "venture capital", "series",
      "market share", "earnings", "stock", "ceo", "strategy",
      "global", "economy", "finance", "inflation", "interest rate",
      "스타트업", "투자", "기업", "매출", "시장",
    ],
  },
  {
    category: "Design",
    keywords: [
      "design", "ux", "ui", "user experience", "interface", "figma",
      "typography", "branding", "visual", "motion", "animation",
      "prototype", "accessibility", "color", "layout", "icon",
      "graphic", "creative", "디자인", "브랜드",
    ],
  },
];

/**
 * @param {string} text - 분류할 텍스트 (title + description 등 합쳐서 전달 권장)
 * @returns {"AI"|"Tech"|"Business"|"Design"}
 */
const classifyCategory = (text) => {
  const lower = text.toLowerCase();

  let best = { category: "Tech", score: 0 };

  for (const rule of RULES) {
    const score = rule.keywords.reduce(
      (acc, kw) => acc + (lower.includes(kw) ? 1 : 0),
      0
    );
    if (score > best.score) {
      best = { category: rule.category, score };
    }
  }

  return best.category;
};

export { classifyCategory };
