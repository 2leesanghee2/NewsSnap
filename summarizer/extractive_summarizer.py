"""
extractive_summarizer.py
TextRank (KR-SBERT 의미 유사도 or TF-IDF fallback) → PageRank → MMR 다양성 필터
"""

import logging
from typing import List, Optional

import networkx as nx
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from config import config
from preprocessor import Preprocessor

logger = logging.getLogger(__name__)


class ExtractiveSummarizer:
    """
    사용법:
        summarizer = ExtractiveSummarizer()
        result = summarizer.summarize(sentences, top_n=5)
        print(" ".join(result))

    의존 패키지:
        pip install networkx scikit-learn sentence-transformers
    """

    def __init__(
        self,
        use_sbert: bool = None,
        sbert_model: str = None,
        damping: float = None,
        mmr_threshold: float = None,
    ):
        self.use_sbert = use_sbert if use_sbert is not None else config.use_sbert
        self.sbert_model = sbert_model or config.sbert_model
        self.damping = damping or config.pagerank_damping
        self.mmr_threshold = mmr_threshold or config.mmr_threshold
        self._encoder = None  # 지연 로딩 (첫 호출 시에만 다운로드)
        self._preprocessor = Preprocessor()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def summarize(self, sentences: List[str], top_n: int = None) -> List[str]:
        """
        Args:
            sentences: Preprocessor.load() 결과 문장 리스트
            top_n:     추출할 문장 수 (None이면 config 기본값 사용)

        Returns:
            원문 순서 유지된 핵심 문장 리스트
        """
        top_n = top_n or config.extractive_top_n

        if len(sentences) <= top_n:
            logger.info("전처리 완료, 문장 수: %d, 요약 문장 수: %d", len(sentences), len(sentences))
            return sentences

        # 1. 유사도 행렬 계산
        sim_matrix = (
            self._sbert_similarity(sentences)
            if self.use_sbert
            else self._tfidf_similarity(sentences)
        )

        # 2. PageRank 점수
        scores = self._pagerank(sim_matrix)

        # 3. 위치 보너스 (앞부분 문장이 보통 핵심)
        n = len(sentences)
        bonus_cutoff = int(n * config.position_bonus_ratio)
        for i in range(bonus_cutoff):
            scores[i] *= config.position_bonus_weight

        # 4. 단어 집합 준비 (MMR 다양성용)
        word_sets = [
            set(self._preprocessor.tokenize(s)) for s in sentences
        ]

        # 5. MMR: 점수 높고 이미 선택된 문장과 중복 낮은 것 우선
        selected_idx = self._mmr_select(scores, word_sets, top_n)

        result = [sentences[i] for i in selected_idx]
        logger.info("전처리 완료, 문장 수: %d, 요약 문장 수: %d", n, len(result))
        return result

    # ------------------------------------------------------------------
    # 유사도 행렬
    # ------------------------------------------------------------------

    def _tfidf_similarity(self, sentences: List[str]) -> np.ndarray:
        vec = TfidfVectorizer()
        tfidf = vec.fit_transform(sentences).toarray()
        sim = cosine_similarity(tfidf)
        np.fill_diagonal(sim, 0)
        return sim

    def _sbert_similarity(self, sentences: List[str]) -> np.ndarray:
        if self._encoder is None:
            try:
                from sentence_transformers import SentenceTransformer
                logger.info("SBERT 모델 로딩: %s (첫 실행 시 다운로드)", self.sbert_model)
                self._encoder = SentenceTransformer(self.sbert_model)
            except ImportError:
                logger.warning("sentence-transformers 미설치 → TF-IDF fallback")
                return self._tfidf_similarity(sentences)

        embeddings = self._encoder.encode(
            sentences,
            batch_size=64,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        sim = cosine_similarity(embeddings)
        np.fill_diagonal(sim, 0)
        return sim

    # ------------------------------------------------------------------
    # PageRank
    # ------------------------------------------------------------------

    def _pagerank(self, sim_matrix: np.ndarray) -> List[float]:
        graph = nx.from_numpy_array(sim_matrix)
        try:
            scores_dict = nx.pagerank(graph, alpha=self.damping, max_iter=200)
        except nx.PowerIterationFailedConvergence:
            logger.warning("PageRank 수렴 실패 — 균등 점수로 fallback")
            n = len(sim_matrix)
            scores_dict = {i: 1 / n for i in range(n)}
        return [scores_dict[i] for i in range(len(sim_matrix))]

    # ------------------------------------------------------------------
    # MMR (Maximal Marginal Relevance)
    # ------------------------------------------------------------------

    def _mmr_select(
        self,
        scores: List[float],
        word_sets: List[set],
        top_n: int,
    ) -> List[int]:
        sorted_idx = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
        selected: List[int] = []

        for idx in sorted_idx:
            if len(selected) >= top_n:
                break
            too_similar = any(
                self._jaccard(word_sets[idx], word_sets[s]) > self.mmr_threshold
                for s in selected
            )
            if not too_similar:
                selected.append(idx)

        return sorted(selected)  # 원문 순서 복원

    @staticmethod
    def _jaccard(a: set, b: set) -> float:
        if not a or not b:
            return 0.0
        return len(a & b) / len(a | b)
