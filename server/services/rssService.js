import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; NewsSnap/3.0)",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
  },
  customFields: {
    item: ["media:content", "source"],
  },
});

/**
 * Google News RSS 피드 목록
 * - 카테고리별 영문 피드 사용 → keyword-extractor 정상 동작 보장
 * - AI 카테고리는 검색 쿼리 기반 피드 사용
 */
const RSS_FEEDS = {
  AI: "https://news.google.com/rss/search?q=artificial+intelligence+machine+learning&hl=en-US&gl=US&ceid=US:en",
  Tech: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en",
  Business: "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en",
  Design: "https://news.google.com/rss/search?q=UX+UI+product+design&hl=en-US&gl=US&ceid=US:en",
};

/**
 * 링크 문자열로부터 결정론적 숫자 ID 생성
 * DB 없이 RSS 아이템을 고유하게 식별하기 위해 사용
 */
const linkToId = (link = "") => {
  let hash = 5381;
  for (let i = 0; i < link.length; i++) {
    hash = ((hash << 5) + hash) ^ link.charCodeAt(i);
    hash = hash >>> 0; // unsigned 32-bit
  }
  return hash.toString();
};

/**
 * HTML 태그 및 불필요한 공백 제거
 */
const stripHtml = (html = "") =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();

/**
 * rss-parser 아이템 → 공통 뉴스 객체 변환
 */
const normalizeItem = (item, category) => ({
  id: linkToId(item.link || item.guid || ""),
  title: stripHtml(item.title || "제목 없음"),
  link: item.link || item.guid || "",
  description: stripHtml(item.contentSnippet || item.content || item.summary || ""),
  pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
  source: item?.source?.$ ?.url || item?.creator || "",
  category,
});

/**
 * 단일 카테고리 RSS 피드 가져오기
 * @param {"AI"|"Tech"|"Business"|"Design"} category
 * @param {number} limit - 최대 아이템 수
 */
const fetchFeedByCategory = async (category, limit = 10) => {
  const url = RSS_FEEDS[category];
  if (!url) throw new Error(`지원하지 않는 카테고리: ${category}`);

  const feed = await parser.parseURL(url);
  return feed.items
    .slice(0, limit)
    .map((item) => normalizeItem(item, category));
};

/**
 * 전체 카테고리 RSS 피드 병렬 수집
 * 실패한 카테고리는 빈 배열로 처리 (전체 요청 실패 방지)
 */
const fetchAllFeeds = async (limitPerCategory = 8) => {
  const categories = Object.keys(RSS_FEEDS);

  const results = await Promise.allSettled(
    categories.map((cat) => fetchFeedByCategory(cat, limitPerCategory))
  );

  const items = [];
  results.forEach((result, idx) => {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      console.warn(`[RSS] ${categories[idx]} 피드 수집 실패:`, result.reason?.message);
    }
  });

  // 최신순 정렬
  items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  return items;
};

export { fetchFeedByCategory, fetchAllFeeds, linkToId, stripHtml };
