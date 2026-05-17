import axios from "axios";
import * as cheerio from "cheerio";
import keyword_extractor from "keyword-extractor";
import pool from "../config/db.js";
import { fetchAllFeeds, fetchFeedByCategory, linkToId, stripHtml } from "./rssService.js";
import { classifyCategory } from "../utils/categoryClassifier.js";

const MAX_TEXT_CHARS = 12000;
const VALID_CATEGORIES = ["AI", "Tech", "Business", "Design"];

// ISO 8601 → MySQL DATETIME 형식 변환 ('2026-05-17T15:32:51.000Z' → '2026-05-17 15:32:51')
const toMySQL = (isoString) =>
  new Date(isoString).toISOString().slice(0, 19).replace("T", " ");

// ============================================================
// 텍스트 처리 유틸
// ============================================================

const SUMMARY_STOP_WORDS = new Set([
  // 영어
  "the","a","an","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","shall",
  "to","of","in","for","on","with","at","by","from","up","about","into","through",
  "and","or","but","if","as","than","that","this","it","its","we","you","he","she","they",
  "not","no","so","then","when","where","how","what","which","who","also","just","more",
  // 한국어 조사·어미
  "이","가","을","를","은","는","에","의","로","으로","과","와","도","에서","부터","까지",
  "이다","입니다","있다","없다","했다","한다","됩니다","합니다","있습니다","없습니다",
  "그","이","저","것","수","등","및","또","하지만","그러나","또한","특히","위해","통해",
]);

/**
 * 문장 분리
 */
const splitSentences = (text) =>
  text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 600);

// 노이즈 문장 패턴 (광고·네비·구독 유도 등)
const NOISE_PATTERNS = [
  /subscribe|newsletter|sign up|log in|click here|read more|cookie|privacy policy/i,
  /all rights reserved|copyright|©/i,
  /advertisement|sponsored|promoted/i,
  /follow us|share this|tweet|facebook/i,
];

const tokenize = (text) =>
  text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !SUMMARY_STOP_WORDS.has(w));

const isNoiseSentence = (s) => NOISE_PATTERNS.some((p) => p.test(s));

/**
 * TextRank 알고리즘으로 문장 중요도 점수 계산
 * 두 문장 사이 공유 단어 비율을 엣지 가중치로 PageRank 적용
 */
const textRank = (sentences, damping = 0.85, iterations = 30) => {
  const n = sentences.length;
  const wordSets = sentences.map((s) => new Set(tokenize(s)));

  // 유사도 행렬 구성
  const sim = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => {
      if (i === j) return 0;
      const intersection = [...wordSets[i]].filter((w) => wordSets[j].has(w)).length;
      if (intersection === 0) return 0;
      return intersection / (Math.log(wordSets[i].size + 2) + Math.log(wordSets[j].size + 2));
    })
  );

  // 행 정규화
  for (let i = 0; i < n; i++) {
    const rowSum = sim[i].reduce((a, b) => a + b, 0);
    if (rowSum > 0) sim[i] = sim[i].map((v) => v / rowSum);
  }

  // PageRank 반복
  let scores = new Array(n).fill(1 / n);
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Array(n).fill((1 - damping) / n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        next[j] += damping * scores[i] * sim[i][j];
      }
    }
    scores = next;
  }
  return scores;
};

/**
 * TextRank + 위치 가중치 + MMR 다양성 필터 추출 요약
 */
const summarizeText = (text, numSentences = 5) => {
  const raw = splitSentences(text).filter((s) => !isNoiseSentence(s));
  if (raw.length === 0) return text.slice(0, 400);
  if (raw.length <= numSentences) return raw.join(" ");

  const trScores = textRank(raw);

  const scored = raw.map((sentence, idx) => {
    const positionBonus = idx < Math.ceil(raw.length * 0.4) ? 1.25 : 1.0;
    const lenPenalty = sentence.length < 35 || sentence.length > 450 ? 0.55 : 1.0;
    // 영어 뉴스 기사에서 대문자 단어(고유명사) 많으면 가중치
    const properNounBonus = (sentence.match(/\b[A-Z][a-z]{2,}\b/g) || []).length * 0.03;
    return {
      sentence,
      idx,
      score: trScores[idx] * positionBonus * lenPenalty + properNounBonus,
      wordSet: new Set(tokenize(sentence)),
    };
  });

  // Greedy MMR: 다양성 보장하며 상위 선택
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const selected = [];
  for (const candidate of sorted) {
    if (selected.length >= numSentences) break;
    const tooSimilar = selected.some((s) => {
      const inter = [...candidate.wordSet].filter((w) => s.wordSet.has(w)).length;
      const union = new Set([...candidate.wordSet, ...s.wordSet]).size;
      return union > 0 && inter / union > 0.42;
    });
    if (!tooSimilar) selected.push(candidate);
  }

  return selected
    .sort((a, b) => a.idx - b.idx)
    .map((s) => s.sentence)
    .join("\n");
};

/**
 * 텍스트에서 제목으로 적합한 핵심 문장 추출
 * TextRank 점수 기반으로 가장 대표적인 짧은 문장 선택
 */
const extractTitle = (text) => {
  const sentences = splitSentences(text).filter((s) => !isNoiseSentence(s));
  if (sentences.length === 0) return text.slice(0, 120).trim();
  const candidates = sentences.filter((s) => s.length >= 25 && s.length <= 160);
  if (candidates.length === 0) return sentences[0].slice(0, 160);
  // TextRank 점수 중 가장 높은 짧은 문장
  const trScores = textRank(sentences);
  const ranked = candidates
    .map((s) => ({ s, score: trScores[sentences.indexOf(s)] }))
    .sort((a, b) => b.score - a.score);
  return ranked[0].s;
};

/**
 * keyword-extractor + bigram 조합 키워드 추출
 * 단일 단어와 두 단어 조합(고유명사 구문 등)을 함께 추출
 */
const extractKeywords = (text, topN = 6) => {
  // 단일 키워드
  let singles = [];
  try {
    singles = keyword_extractor.extract(text, {
      language: "english",
      remove_digits: true,
      return_changed_case: false,
      remove_duplicates: true,
    });
  } catch {
    singles = tokenize(text);
  }

  // bigram: 연속된 두 단어 중 빈도 2 이상인 것
  const words = tokenize(text);
  const bigramFreq = new Map();
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    bigramFreq.set(bg, (bigramFreq.get(bg) || 0) + 1);
  }
  const topBigrams = [...bigramFreq.entries()]
    .filter(([, c]) => c >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([bg]) => bg);

  // bigram 우선, 나머지를 단일 키워드로 채움
  const combined = [...topBigrams];
  for (const kw of singles) {
    if (combined.length >= topN) break;
    // bigram에 이미 포함된 단어면 스킵
    if (!combined.some((bg) => bg.includes(kw))) combined.push(kw);
  }
  return combined.slice(0, topN);
};

// ============================================================
// DB 공통 헬퍼
// ============================================================

/**
 * RSS 아이템 배열을 Summaries 테이블에 일괄 Upsert
 * 이미 존재하는 ID는 title / summary / keywords 만 갱신
 */
const upsertSummaries = async (items) => {
  if (items.length === 0) return;

  const values = items.map((item) => [
    item.id,
    item.title,
    item.category,
    item.summary,
    JSON.stringify(item.keywords),
    item.sourceUrl || null,
    item.source || null,
    toMySQL(item.createdAt),
  ]);

  await pool.query(
    `INSERT INTO Summaries (id, title, category, summary, keywords, source_url, source, created_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       title      = VALUES(title),
       summary    = VALUES(summary),
       keywords   = VALUES(keywords)`,
    [values]
  );
};

/**
 * DB에서 요약 목록 조회 (북마크 여부 LEFT JOIN 포함)
 * @returns 각 row에 bookmarked: 0|1
 */
/**
 * @param {{ category?, search?, requestingUserId? }} options
 * requestingUserId: 로그인한 사용자 ID — isOwner 계산에 사용
 */
const querySummaries = async ({ category, search, requestingUserId } = {}) => {
  const conditions = [];
  const params = [];

  if (category && VALID_CATEGORIES.includes(category)) {
    conditions.push("s.category = ?");
    params.push(category);
  }

  if (search && search.trim()) {
    conditions.push("(s.title LIKE ? OR s.summary LIKE ?)");
    const like = `%${search.trim()}%`;
    params.push(like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT
       s.id,
       s.user_id     AS ownerId,
       s.title,
       s.category,
       s.summary,
       s.keywords,
       s.source_url  AS sourceUrl,
       s.source,
       s.created_at  AS createdAt,
       IF(b.summary_id IS NOT NULL, 1, 0) AS bookmarked
     FROM Summaries s
     LEFT JOIN Bookmarks b ON b.summary_id = s.id
     ${where}
     ORDER BY s.created_at DESC
     LIMIT 100`,
    params
  );

  return rows.map((row) => ({
    ...row,
    keywords:   typeof row.keywords === "string" ? JSON.parse(row.keywords) : row.keywords,
    bookmarked: row.bookmarked === 1,
    // 로그인한 사용자가 작성자일 때만 true
    isOwner:    requestingUserId != null && row.ownerId === requestingUserId,
  }));
};

// ============================================================
// Gemini API 호출 — 실제 AI 요약
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const VALID_CATS     = ["AI", "Tech", "Business", "Design"];

const callGeminiAPI = async (text) => {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");

  const prompt = `다음 뉴스 텍스트를 분석하고, 아래 JSON 형식으로만 응답하세요. JSON 외 다른 텍스트는 절대 포함하지 마세요.

{
  "title": "기사 핵심을 담은 제목 (60자 이내)",
  "summary": "3~5문장의 한국어 요약. 핵심 내용·배경·의미를 포함하고, 원문을 그대로 복사하지 말고 재구성할 것.",
  "category": "AI | Tech | Business | Design 중 정확히 하나만 선택",
  "keywords": ["핵심키워드1", "핵심키워드2", "핵심키워드3", "핵심키워드4", "핵심키워드5"]
}

뉴스 텍스트:
${text.slice(0, 6000)}`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    },
    {
      headers: { "Content-Type": "application/json", "X-goog-api-key": GEMINI_API_KEY },
      timeout: 30000,
    }
  );

  const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Gemini 응답 파싱 실패: ${raw.slice(0, 100)}`);
  }

  return {
    title:    String(parsed.title    || "").slice(0, 500),
    summary:  String(parsed.summary  || ""),
    category: VALID_CATS.includes(parsed.category) ? parsed.category : "Tech",
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 6).map(String) : [],
  };
};

/**
 * Gemini 재시도 포함 호출 (최대 2회)
 * 실패 시 에러를 그대로 throw — 사용자 제출 요약에서만 사용
 */
const callGeminiWithRetry = async (text, retries = 2) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await callGeminiAPI(text);
    } catch (err) {
      const detail = err.response?.data?.error?.message || err.response?.data || err.message;
      console.warn(`[Gemini] 시도 ${attempt}/${retries} 실패:`, detail);
      if (attempt === retries) throw err;

      // Gemini가 알려주는 retry 대기 시간 파싱 (없으면 40s 기본값)
      const retryMatch = String(detail).match(/Please retry in (\d+(?:\.\d+)?)s/);
      const waitMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) + 2) * 1000 : 40000;
      console.log(`[Gemini] ${waitMs / 1000}초 대기 후 재시도...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
};

const PYTHON_API_URL = "http://localhost:8000";

const isYouTubeUrl = (url) =>
  /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/.test(url);

const callPythonSummarizer = async (text, pageTitle = "") => {
  try {
    const response = await axios.post(
      `${PYTHON_API_URL}/summarize`,
      { text, mode: "extractive", sentences: 8, page_title: pageTitle },
      { timeout: 60000 }
    );
    const d = response.data;
    // page_title이 있으면 Python이 반환한 title 대신 사용 (요약 중복 방지)
    const title = pageTitle.trim()
      ? pageTitle.trim().slice(0, 200)
      : String(d.title || "").slice(0, 500);
    console.log("[Python] 텍스트 요약 성공");
    return {
      title,
      summary:  String(d.summary  || ""),
      category: VALID_CATS.includes(d.category) ? d.category : "Tech",
      keywords: Array.isArray(d.keywords) ? d.keywords.slice(0, 6).map(String) : [],
    };
  } catch {
    return null;
  }
};

const callPythonYoutube = async (url) => {
  try {
    const response = await axios.post(
      `${PYTHON_API_URL}/summarize/youtube`,
      { url, sentences: 8 },
      { timeout: 120000 } // 자막 다운로드 시간 고려
    );
    const d = response.data;
    console.log("[Python] YouTube 요약 성공:", d.videoTitle);
    return {
      title:    String(d.title    || "").slice(0, 500),
      summary:  String(d.summary  || ""),
      category: VALID_CATS.includes(d.category) ? d.category : "Tech",
      keywords: Array.isArray(d.keywords) ? d.keywords.slice(0, 6).map(String) : [],
    };
  } catch (err) {
    throw new Error(err.response?.data?.detail || "YouTube 자막 요약에 실패했습니다.");
  }
};

/**
 * 요약 체인: Python FastAPI → 로컬 JS TF-IDF
 * Gemini 미사용
 */
const callGeminiOrFallback = async (text, pageTitle = "") => {
  // 1순위: Python FastAPI (실행 중일 때만)
  const pythonResult = await callPythonSummarizer(text, pageTitle);
  if (pythonResult) return pythonResult;

  // 2순위: 로컬 JS TF-IDF
  console.log("[Summarizer] 로컬 JS 분석 사용");
  return {
    title:    pageTitle.trim().slice(0, 200) || extractTitle(text),
    summary:  summarizeText(text, 8),
    category: classifyCategory(text),
    keywords: extractKeywords(text, 6),
  };
};

// ============================================================
// RSS 아이템 → 로컬 분석으로 처리 (Gemini 미사용)
// 수십 개 아이템을 동시에 Gemini에 보내면 rate limit 초과
// ============================================================
const processRssItem = (item) => {
  const fullText = [item.title, item.description].filter(Boolean).join(" ");

  return {
    id:        item.id,
    title:     item.title,
    category:  item.category,                    // RSS 카테고리 피드 기반 분류
    summary:   summarizeText(fullText, 3),        // 로컬 TF-IDF 요약
    keywords:  extractKeywords(fullText, 6),
    sourceUrl: item.link  || null,
    source:    item.source || null,
    createdAt: item.pubDate,
  };
};

// ============================================================
// GET /api/summaries
// RSS → Upsert → DB 조회 → 반환
// ============================================================
const getAllSummaries = async ({ category, search, requestingUserId } = {}) => {
  // 1. RSS 수집
  let rssItems;
  try {
    rssItems = category && VALID_CATEGORIES.includes(category)
      ? await fetchFeedByCategory(category, 12)
      : await fetchAllFeeds(8);
  } catch (err) {
    console.warn("[RSS] 피드 수집 실패, DB 캐시 사용:", err.message);
    rssItems = [];
  }

  // 2. 로컬 분석 후 DB Upsert (processRssItem은 동기 함수)
  const processed = rssItems.map(processRssItem);
  await upsertSummaries(processed);

  // 3. DB 조회 (북마크 + 소유권 포함)
  return querySummaries({ category, search, requestingUserId });
};

// ============================================================
// POST /api/summary
// 사용자 입력 URL/텍스트 → 처리 → DB 저장 → 반환
// ============================================================

const crawlUrl = async (url) => {
  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate",
    },
    maxRedirects: 5,
  });

  const $ = cheerio.load(response.data);

  // 노이즈 요소 전부 제거
  $(
    "script, style, nav, header, footer, aside, iframe, noscript, " +
    "figure, figcaption, .ad, [class*='ad-'], [id*='ad-'], " +
    "[class*='relate'], [class*='recommend'], [class*='popular'], " +
    "[class*='sidebar'], [class*='banner'], [class*='subscribe'], " +
    "[class*='newsletter'], [class*='copyright'], [class*='sns'], " +
    "[class*='share'], [class*='tag'], [class*='comment']"
  ).remove();

  // 노이즈 문단 패턴
  const NOISE_TEXT = /QR코드|클릭하면|구독|좋아요|알림설정|닫기|광고|협찬|후원|저작권|무단전재|재배포|모든 권리/;

  // 인라인 태그(strong/em/span 등) 사이 공백 보존: 태그 제거 전 공백 삽입
  const nodeText = (node) => {
    const html = $(node).html() || "";
    return html
      .replace(/<\/(strong|em|span|b|i|a|mark)[^>]*>/gi, " ")  // 닫는 인라인 태그 뒤 공백
      .replace(/<[^>]+>/g, "")                                   // 나머지 태그 제거
      .replace(/&nbsp;/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  };

  const cleanParagraphs = (el) =>
    el.find("p, h2, h3, h4")
      .map((_, node) => nodeText(node))
      .get()
      .filter((t) => t.length > 15 && !NOISE_TEXT.test(t));

  let rawText = "";
  const bodySelectors = [
    "article",
    "[class*='article-body']",
    "[class*='article_body']",
    "[class*='news-content']",
    "[class*='news_content']",
    "[class*='article-content']",
    "[class*='story-body']",
    "[class*='post-body']",
    "main",
    "[class*='content']",
    "body",
  ];

  for (const sel of bodySelectors) {
    const el = $(sel).first();
    if (el.length > 0) {
      const paras = cleanParagraphs(el);
      const text = paras.join(" ");
      if (text.length > rawText.length) rawText = text;
      if (rawText.length > 2000) break;
    }
  }

  // 영문/숫자↔한글 경계 공백 삽입: "AI기업" → "AI 기업"
  rawText = rawText.replace(/([A-Za-z0-9])([가-힣])/g, "$1 $2");
  rawText = rawText.replace(/([가-힣])([A-Za-z0-9])/g, "$1 $2");
  // 마침표/쉼표 뒤 공백 누락: "합니다.리스크엑스" → "합니다. 리스크엑스"
  rawText = rawText.replace(/([.!?,])([가-힣A-Za-z])/g, "$1 $2");
  // 연속 공백 제거
  rawText = rawText.replace(/ {2,}/g, " ");

  // 2순위: 본문 추출 실패 시 meta 태그로 폴백
  if (rawText.length < 80) {
    const ogDesc    = $('meta[property="og:description"]').attr("content") || "";
    const metaDesc  = $('meta[name="description"]').attr("content") || "";
    const ogTitle   = $('meta[property="og:title"]').attr("content") || "";
    const pageTitle = $("title").text() || "";

    rawText = [ogTitle || pageTitle, ogDesc || metaDesc]
      .filter(Boolean)
      .join(". ");
  }

  // 3순위: meta도 없으면 페이지 title만이라도 사용
  if (rawText.length < 20) {
    const title = $("title").text().trim();
    if (title) rawText = title;
  }

  if (!rawText || rawText.length < 10) {
    throw new Error(
      "본문을 추출할 수 없습니다. JavaScript 렌더링 전용 페이지이거나 접근이 차단된 사이트일 수 있습니다."
    );
  }

  const pageTitle =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("title").text().trim() ||
    "";

  return { text: stripHtml(rawText).slice(0, MAX_TEXT_CHARS), pageTitle };
};

const createSummary = async ({ url, content, userId = null }) => {
  let rawText   = "";
  let sourceUrl = null;
  let analyzed  = null;

  if (url && url.trim()) {
    const trimmedUrl = url.trim();
    try { new URL(trimmedUrl); } catch { throw new Error("유효하지 않은 URL 형식입니다."); }

    // YouTube URL → Python yt-dlp 자막 요약
    if (isYouTubeUrl(trimmedUrl)) {
      analyzed  = await callPythonYoutube(trimmedUrl);
      sourceUrl = trimmedUrl;
    } else {
      // 일반 뉴스 URL → 크롤링 후 요약
      const crawled = await crawlUrl(trimmedUrl);
      rawText   = crawled.text;
      sourceUrl = trimmedUrl;
      analyzed  = await callGeminiOrFallback(rawText, crawled.pageTitle);
    }
  } else if (content && content.trim()) {
    rawText  = content.trim().slice(0, MAX_TEXT_CHARS);
    analyzed = await callGeminiOrFallback(rawText, "");
  } else {
    throw new Error("URL 또는 뉴스 본문 중 하나는 반드시 입력해야 합니다.");
  }

  const { title, summary, category, keywords } = analyzed;

  const id        = linkToId(sourceUrl || rawText.slice(0, 80));
  const source    = sourceUrl ? new URL(sourceUrl).hostname : null;
  const createdAt = toMySQL(new Date().toISOString());

  // DB 저장 — user_id 포함 (중복 ID면 내용 갱신)
  await pool.query(
    `INSERT INTO Summaries (id, user_id, title, category, summary, keywords, source_url, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title    = VALUES(title),
       summary  = VALUES(summary),
       keywords = VALUES(keywords)`,
    [id, userId, title, category, summary, JSON.stringify(keywords), sourceUrl, source, createdAt]
  );

  // 저장된 행 조회 (북마크 + 소유권 포함)
  const [rows] = await pool.query(
    `SELECT
       s.id, s.user_id AS ownerId, s.title, s.category, s.summary, s.keywords,
       s.source_url AS sourceUrl, s.source,
       s.created_at AS createdAt,
       IF(b.summary_id IS NOT NULL, 1, 0) AS bookmarked
     FROM Summaries s
     LEFT JOIN Bookmarks b ON b.summary_id = s.id
     WHERE s.id = ?`,
    [id]
  );

  const row = rows[0];
  return {
    ...row,
    keywords:   typeof row.keywords === "string" ? JSON.parse(row.keywords) : row.keywords,
    bookmarked: row.bookmarked === 1,
    isOwner:    userId != null && row.ownerId === userId,
  };
};

// ============================================================
// 북마크 서비스
// ============================================================

/**
 * 북마크 토글 — 존재하면 삭제, 없으면 추가
 * @returns {{ bookmarked: boolean }}
 */
const toggleBookmark = async (summaryId) => {
  const [existing] = await pool.query(
    "SELECT id FROM Bookmarks WHERE summary_id = ? LIMIT 1",
    [summaryId]
  );

  if (existing.length > 0) {
    await pool.query("DELETE FROM Bookmarks WHERE summary_id = ?", [summaryId]);
    return { bookmarked: false };
  }

  // Summaries 에 행이 없으면 FK 오류 → 먼저 존재 확인
  const [summary] = await pool.query(
    "SELECT id FROM Summaries WHERE id = ? LIMIT 1",
    [summaryId]
  );
  if (summary.length === 0) {
    throw new Error("존재하지 않는 요약입니다.");
  }

  await pool.query("INSERT INTO Bookmarks (summary_id) VALUES (?)", [summaryId]);
  return { bookmarked: true };
};

/**
 * 북마크된 요약 전체 조회
 */
const getBookmarks = async () => {
  const [rows] = await pool.query(
    `SELECT
       s.id, s.title, s.category, s.summary, s.keywords,
       s.source_url AS sourceUrl, s.source,
       s.created_at AS createdAt,
       1            AS bookmarked,
       b.created_at AS bookmarkedAt
     FROM Bookmarks b
     JOIN Summaries s ON s.id = b.summary_id
     ORDER BY b.created_at DESC`
  );

  return rows.map((row) => ({
    ...row,
    keywords:   typeof row.keywords === "string" ? JSON.parse(row.keywords) : row.keywords,
    bookmarked: true,
  }));
};

// ============================================================
// 요약 삭제
// ============================================================
const deleteSummary = async (id, requestingUserId) => {
  const [rows] = await pool.query(
    "SELECT user_id FROM Summaries WHERE id = ? LIMIT 1",
    [id]
  );
  if (rows.length === 0) throw new Error("존재하지 않는 요약입니다.");

  const ownerId = rows[0].user_id;
  if (ownerId === null) throw new Error("RSS로 수집된 뉴스는 삭제할 수 없습니다.");
  if (ownerId !== requestingUserId) throw new Error("본인이 등록한 요약만 삭제할 수 있습니다.");

  await pool.query("DELETE FROM Summaries WHERE id = ?", [id]);
};

export { getAllSummaries, createSummary, toggleBookmark, getBookmarks, deleteSummary };
