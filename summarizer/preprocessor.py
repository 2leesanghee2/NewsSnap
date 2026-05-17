"""
preprocessor.py
입력 파일(.srt / .vtt / .txt) 읽기 → 자막 파싱 → 문장 분리 → 전처리
"""

import re
import logging
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

STOPWORDS = {
    "이", "가", "을", "를", "은", "는", "에", "의", "로", "으로",
    "과", "와", "도", "에서", "부터", "까지", "이다", "있다", "없다",
    "그", "저", "것", "수", "등", "및", "또", "하지만", "그러나",
    "그리고", "따라서", "그래서", "즉", "또한", "특히", "위해", "통해",
    "합니다", "있습니다", "없습니다", "됩니다", "됐습니다", "했습니다",
    "라고", "이라고", "라는", "이라는", "라며", "이라며",
}

# 노이즈 문장 패턴 (광고·구독 유도·크레딧 등)
_NOISE_RE = re.compile(
    r"(구독|좋아요|알림|댓글|공유|팔로우|copyright|all rights reserved"
    r"|sponsored|advertisement|click here|subscribe|newsletter)",
    re.IGNORECASE,
)


class SubtitleParser:
    """
    .srt / .vtt 자막에서 순수 텍스트만 추출
    """

    @staticmethod
    def parse_srt(path: Path) -> str:
        raw = path.read_text(encoding="utf-8")
        raw = re.sub(r"^\d+\s*$", "", raw, flags=re.MULTILINE)
        raw = re.sub(
            r"\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}",
            "", raw,
        )
        raw = re.sub(r"<[^>]+>", "", raw)
        return re.sub(r"\n{2,}", " ", raw).strip()

    @staticmethod
    def parse_vtt(path: Path) -> str:
        raw = path.read_text(encoding="utf-8")
        # WEBVTT 헤더 블록 제거
        raw = re.sub(r"^WEBVTT.*?(\n\n|\Z)", "", raw, flags=re.DOTALL)
        # 타임코드 라인 제거
        raw = re.sub(
            r"\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}[^\n]*",
            "", raw,
        )
        # HTML 태그 제거
        raw = re.sub(r"<[^>]+>", "", raw)
        # VTT 메타데이터 제거 (Kind: captions, Language: ko 등)
        raw = re.sub(r"^(Kind|Language|NOTE|STYLE|REGION)\s*:?[^\n]*$", "", raw, flags=re.MULTILINE)
        # 숫자만 있는 줄(자막 번호) 제거
        raw = re.sub(r"^\d+\s*$", "", raw, flags=re.MULTILINE)
        # 중복 공백·줄바꿈 정리 후 한 줄로
        raw = re.sub(r"\n+", " ", raw)
        raw = re.sub(r"\s{2,}", " ", raw)
        return raw.strip()


class Preprocessor:
    """
    파일 로드 → 텍스트 정제 → 문장 분리 → 중복 제거 → 노이즈 제거
    """

    def __init__(self, stopwords: set = None):
        self.stopwords = stopwords or STOPWORDS
        self._parser = SubtitleParser()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def load(self, file_path: str) -> List[str]:
        """
        파일 읽기 → 전처리된 문장 리스트 반환

        Args:
            file_path: .srt / .vtt / .txt 경로

        Returns:
            전처리된 문장 리스트
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"파일을 찾을 수 없습니다: {path}")

        raw_text = self._read(path)
        clean_text = self._clean(raw_text)
        sentences = self._split_sentences(clean_text)
        sentences = self._deduplicate(sentences)
        sentences = self._remove_noise(sentences)

        logger.info("전처리 완료, 문장 수: %d", len(sentences))
        return sentences

    def tokenize(self, text: str) -> List[str]:
        """
        형태소 분석 없이 공백 기반 토큰화 + 불용어 제거.
        고품질이 필요하면 koNLPy Okt로 교체 가능.
        """
        tokens = re.sub(r"[^\w가-힣]", " ", text).split()
        return [t for t in tokens if t not in self.stopwords and len(t) > 1]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _read(self, path: Path) -> str:
        suffix = path.suffix.lower()
        dispatch = {
            ".srt": self._parser.parse_srt,
            ".vtt": self._parser.parse_vtt,
            ".txt": lambda p: p.read_text(encoding="utf-8"),
        }
        if suffix not in dispatch:
            raise ValueError(f"지원하지 않는 형식: {suffix}  (srt / vtt / txt만 가능)")
        return dispatch[suffix](path)

    def _clean(self, text: str) -> str:
        text = re.sub(r"http\S+", "", text)              # URL 제거
        text = re.sub(r"\[.*?\]|\(.*?\)", "", text)      # 괄호 내용 제거
        text = re.sub(r"[^\w\s가-힣.,!?]", " ", text)
        text = re.sub(r"\s{2,}", " ", text)
        return text.strip()

    def _split_sentences(self, text: str) -> List[str]:
        try:
            import kss
            sentences = kss.split_sentences(text)
        except ImportError:
            logger.warning("kss 미설치 — 마침표 기반 fallback 사용 (pip install kss 권장)")
            sentences = re.split(r"(?<=[.!?])\s+", text)

        return [s.strip() for s in sentences if len(s.strip()) > 10]

    def _deduplicate(self, sentences: List[str]) -> List[str]:
        seen: set = set()
        result = []
        for s in sentences:
            # 공백·구두점 제거 후 비교 (근접 중복 제거)
            key = re.sub(r"[\s\.,!?·…]+", "", s)
            if key not in seen:
                seen.add(key)
                result.append(s)
        return result

    def _remove_noise(self, sentences: List[str]) -> List[str]:
        return [s for s in sentences if not _NOISE_RE.search(s)]
