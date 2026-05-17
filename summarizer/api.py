"""
api.py — FastAPI 요약 마이크로서비스
실행: python -X utf8 -m uvicorn api:app --host 0.0.0.0 --port 8000
"""

import os
import re
import tempfile
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from preprocessor import Preprocessor
from extractive_summarizer import ExtractiveSummarizer

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# 카테고리 분류 (NewsSnap categoryClassifier.js 와 동일 로직)
# ------------------------------------------------------------------
_CATEGORY_KEYWORDS = {
    "AI": [
        "artificial intelligence", "machine learning", "deep learning", "neural",
        "gpt", "llm", "chatgpt", "gemini", "claude", "openai", "transformer",
        "인공지능", "머신러닝", "딥러닝", "AI", "자연어처리",
    ],
    "Business": [
        "stock", "market", "economy", "finance", "investment", "startup", "revenue",
        "profit", "ipo", "merger", "acquisition", "venture", "fund",
        "경제", "주식", "금융", "투자", "스타트업", "매출", "기업",
    ],
    "Design": [
        "design", "ui", "ux", "figma", "typography", "branding", "creative",
        "adobe", "sketch", "prototype", "interface",
        "디자인", "UI", "UX", "브랜딩",
    ],
}

def classify_category(text: str) -> str:
    lower = text.lower()
    scores = {cat: 0 for cat in _CATEGORY_KEYWORDS}
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in lower:
                scores[cat] += 1
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "Tech"


def extract_keywords_simple(text: str, top_n: int = 6) -> list[str]:
    words = re.sub(r"[^\w가-힣]", " ", text).split()
    stop = {"the","a","an","is","are","was","were","be","to","of","in","for",
            "on","with","at","by","and","or","but","it","this","that","as"}
    freq: dict[str, int] = {}
    for w in words:
        w = w.lower()
        if len(w) > 3 and w not in stop:
            freq[w] = freq.get(w, 0) + 1
    return sorted(freq, key=freq.get, reverse=True)[:top_n]


# ------------------------------------------------------------------
# 띄어쓰기 교정 (로컬 패턴 기반)
# ------------------------------------------------------------------
def fix_spacing(text: str) -> str:
    """
    크롤링된 한국어 텍스트의 공백 오류를 패턴 기반으로 교정.
    - 한글↔영문/숫자 경계 공백 삽입
    - 한글 조사 앞뒤 공백 정규화
    - 연속 공백 제거
    """
    # 영문/숫자 → 한글 경계: "AI기업" → "AI 기업"
    text = re.sub(r"([A-Za-z0-9])([가-힣])", r"\1 \2", text)
    # 한글 → 영문/숫자 경계: "기업AI" → "기업 AI"
    text = re.sub(r"([가-힣])([A-Za-z0-9])", r"\1 \2", text)
    # 마침표/쉼표 뒤 공백 누락: "합니다.리스크엑스는" → "합니다. 리스크엑스는"
    text = re.sub(r"([.!?,])([가-힣A-Za-z])", r"\1 \2", text)
    # 연속 공백 정리
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


def fix_spacing_lines(lines: list[str]) -> list[str]:
    return [fix_spacing(line) for line in lines]


# ------------------------------------------------------------------
# 결론 문장 선택
# ------------------------------------------------------------------
_CONCLUSION_HINTS = [
    "계획", "방침", "목표", "향후", "앞으로", "전망", "예정",
    "밝혔다", "강조했다", "말했다", "덧붙였다", "설명했다", "전했다",
    "기대", "성장", "나아갈", "추진", "집중",
]

def pick_conclusion(sentences: list[str], used: list[str]) -> str:
    """
    요약에 쓰이지 않은 문장 중 결론으로 적합한 문장 선택.
    결론 키워드 포함 문장 우선, 없으면 마지막 남은 문장 사용.
    """
    used_set = set(used)
    remaining = [s for s in sentences if s not in used_set and len(s) > 15]

    for hint in _CONCLUSION_HINTS:
        for s in remaining:
            if hint in s:
                return s

    # fallback: 남은 문장 중 마지막
    return remaining[-1] if remaining else ""


# ------------------------------------------------------------------
# 앱 시작 시 모델 미리 로딩 (첫 요청 지연 방지)
# ------------------------------------------------------------------
_preprocessor: Preprocessor = None
_summarizer: ExtractiveSummarizer = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _preprocessor, _summarizer
    logger.info("모델 로딩 중...")
    _preprocessor = Preprocessor()
    _summarizer = ExtractiveSummarizer(use_sbert=True)
    # SBERT 미리 워밍업
    dummy = _summarizer._sbert_similarity(["워밍업 문장입니다.", "모델을 미리 로딩합니다."])
    logger.info("준비 완료 — http://localhost:8000")
    yield
    logger.info("서버 종료")

app = FastAPI(title="Korean Summarizer API", lifespan=lifespan)


# ------------------------------------------------------------------
# 스키마
# ------------------------------------------------------------------
class SummarizeRequest(BaseModel):
    text: str
    mode: Literal["extractive", "abstractive", "hybrid"] = "extractive"
    sentences: int = 8
    page_title: str = ""  # 크롤링된 페이지 제목 (있으면 요약에서 제목 분리)

class SummarizeResponse(BaseModel):
    title: str
    summary: str
    category: str
    keywords: list[str]


# ------------------------------------------------------------------
# 엔드포인트
# ------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/summarize", response_model=SummarizeResponse)
def summarize(req: SummarizeRequest):
    if not req.text or len(req.text.strip()) < 20:
        raise HTTPException(status_code=400, detail="텍스트가 너무 짧습니다.")

    try:
        sentences = _preprocessor._split_sentences(_preprocessor._clean(req.text))
        sentences = _preprocessor._deduplicate(sentences)
        sentences = _preprocessor._remove_noise(sentences)

        if not sentences:
            raise HTTPException(status_code=422, detail="유효한 문장을 추출할 수 없습니다.")

        # page_title이 있으면 그대로 제목 사용, 없으면 본문에서 추출
        has_page_title = bool(req.page_title and req.page_title.strip())
        if has_page_title:
            title_candidate = req.page_title.strip()
        else:
            title_candidate = next(
                (s for s in sentences if 20 <= len(s) <= 120), sentences[0]
            )

        if req.mode in ("extractive", "hybrid"):
            # page_title 없을 땐 top_n+1 뽑아서 제목 문장 제외
            fetch_n = req.sentences if has_page_title else req.sentences + 1
            top = _summarizer.summarize(sentences, top_n=fetch_n)

            if has_page_title:
                summary_sentences = top[:req.sentences]
            else:
                summary_sentences = [s for s in top if s.strip() != title_candidate.strip()]
                summary_sentences = summary_sentences[:req.sentences] if summary_sentences else top[:req.sentences]

            # 맞춤법·띄어쓰기 교정
            corrected = fix_spacing_lines(summary_sentences)

            # 결론 문장 추가 (요약에 없는 문장 중 결론 성격 문장 선택)
            conclusion = pick_conclusion(sentences, summary_sentences)
            if conclusion:
                corrected_conclusion = _spell_check(conclusion)
                corrected.append(corrected_conclusion)

            summary_text = "\n".join(corrected)

            # hybrid: 추상 요약 시도 (KoBART 로드 실패 시 extractive로 fallback)
            if req.mode == "hybrid":
                try:
                    from abstractive_summarizer import AbstractiveSummarizer
                    abst = AbstractiveSummarizer()
                    summary_text = abst.summarize(summary_text, max_sentences=req.sentences)
                except Exception as e:
                    logger.warning("KoBART 실패, extractive 결과 반환: %s", e)

        else:  # abstractive
            from abstractive_summarizer import AbstractiveSummarizer
            abst = AbstractiveSummarizer()
            summary_text = abst.summarize(req.text, max_sentences=req.sentences)
            top = sentences  # 키워드용

        return SummarizeResponse(
            title=title_candidate[:200],
            summary=summary_text,
            category=classify_category(req.text),
            keywords=extract_keywords_simple(req.text, top_n=6),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("요약 오류: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------------
# YouTube 자막 다운로드 + 요약
# ------------------------------------------------------------------
class YoutubeRequest(BaseModel):
    url: str
    sentences: int = 5

class YoutubeResponse(SummarizeResponse):
    videoTitle: str


def _extract_video_id(url: str) -> str:
    match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    if not match:
        raise ValueError("YouTube 영상 ID를 찾을 수 없습니다.")
    return match.group(1)


def _download_subtitles(url: str, _tmpdir: str) -> tuple[str, str]:
    """
    youtube-transcript-api로 자막 가져오기.
    공식 자막 → 자동 생성 자막 순으로 한국어·영어 모두 시도.
    Returns: (자막 텍스트, 영상 제목)
    """
    from youtube_transcript_api import YouTubeTranscriptApi

    video_id = _extract_video_id(url)

    # v1.x: 인스턴스 생성 후 list() 호출
    api = YouTubeTranscriptApi()

    try:
        transcript_list = api.list(video_id)
    except Exception as e:
        raise ValueError(f"자막 목록을 가져올 수 없습니다: {e}")

    transcript = None
    lang_used = ""

    # 1순위: 공식 자막 (한국어 → 영어)
    for lang in ["ko", "en"]:
        try:
            transcript = transcript_list.find_manually_created_transcript([lang])
            lang_used = lang + " (공식)"
            break
        except Exception:
            continue

    # 2순위: 자동 생성 자막 (한국어 → 영어)
    if not transcript:
        for lang in ["ko", "en"]:
            try:
                transcript = transcript_list.find_generated_transcript([lang])
                lang_used = lang + " (자동생성)"
                break
            except Exception:
                continue

    # 3순위: 아무 자막이나 첫 번째
    if not transcript:
        try:
            transcript = next(iter(transcript_list))
            lang_used = "기타"
        except Exception as e:
            raise ValueError(f"사용 가능한 자막이 없습니다: {e}")

    # v1.x: fetch()는 FetchedTranscript 객체 반환 → to_raw_data()로 dict 리스트 변환
    fetched = transcript.fetch()
    raw_data = fetched.to_raw_data() if hasattr(fetched, "to_raw_data") else fetched
    text = " ".join(entry["text"] for entry in raw_data)
    text = re.sub(r"\s{2,}", " ", text).strip()

    logger.info("자막: %s | 영상 ID: %s", lang_used, video_id)
    return text, video_id


@app.post("/summarize/youtube", response_model=YoutubeResponse)
def summarize_youtube(req: YoutubeRequest):
    if not req.url or "youtube" not in req.url and "youtu.be" not in req.url:
        raise HTTPException(status_code=400, detail="유효한 YouTube URL이 아닙니다.")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            raw_text, video_title = _download_subtitles(req.url, tmpdir)

        sentences = _preprocessor._split_sentences(_preprocessor._clean(raw_text))
        sentences = _preprocessor._deduplicate(sentences)
        sentences = _preprocessor._remove_noise(sentences)

        if not sentences:
            raise HTTPException(status_code=422, detail="자막에서 유효한 문장을 추출할 수 없습니다.")

        title_candidate = next(
            (s for s in sentences if 20 <= len(s) <= 120), sentences[0]
        )

        top = _summarizer.summarize(sentences, top_n=req.sentences + 1)
        summary_sentences = [s for s in top if s.strip() != title_candidate.strip()]
        if not summary_sentences:
            summary_sentences = top[:req.sentences]
        else:
            summary_sentences = summary_sentences[:req.sentences]

        corrected = fix_spacing_lines(summary_sentences)
        conclusion = pick_conclusion(sentences, summary_sentences)
        if conclusion:
            corrected.append(fix_spacing(conclusion))
        summary_text = "\n".join(corrected)

        return YoutubeResponse(
            title=title_candidate[:200],
            summary=summary_text,
            category=classify_category(raw_text),
            keywords=extract_keywords_simple(raw_text, top_n=6),
            videoTitle=video_title or req.url,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("YouTube 요약 오류: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
