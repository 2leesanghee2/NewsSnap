"""
abstractive_summarizer.py
KoBART (digit82/kobart-summarization) 로컬 로드 → 긴 텍스트 청크 처리 → 추상 요약 생성
외부 API 호출 없음 — 완전 로컬 동작
"""

import logging
from typing import List, Optional

from config import config

logger = logging.getLogger(__name__)


class AbstractiveSummarizer:
    """
    사용법:
        summarizer = AbstractiveSummarizer()
        result = summarizer.summarize(text, max_sentences=3)

    의존 패키지:
        pip install transformers torch sentencepiece
        (KoBART는 내부적으로 sentencepiece 토크나이저 사용)

    모델 옵션:
        - "digit82/kobart-summarization"   KoBART 뉴스 요약 (기본값, 추천)
        - "paust/pko-t5-base"              KoT5 계열
    """

    def __init__(self, model_name: str = None):
        self.model_name = model_name or config.abstractive_model
        self._tokenizer = None
        self._model = None
        self._device = config.device

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def summarize(self, text: str, max_sentences: int = 3) -> str:
        """
        Args:
            text:          요약할 원문 (긴 텍스트도 청크로 자동 처리)
            max_sentences: 최종 요약 문장 수 (생성 길이 가이드로 사용)

        Returns:
            요약된 문자열
        """
        self._load_model()

        # 토큰 수가 max_input_tokens 초과 시 청크 분할
        chunks = self._chunk_text(text)
        logger.info("청크 수: %d", len(chunks))

        summaries = [self._generate(chunk, max_sentences) for chunk in chunks]

        if len(summaries) == 1:
            return summaries[0]

        # 청크 요약들을 합쳐서 한 번 더 요약 (계층적 요약)
        merged = " ".join(summaries)
        logger.info("청크 요약 합산 후 최종 요약 생성")
        return self._generate(merged, max_sentences)

    # ------------------------------------------------------------------
    # 모델 로딩 (싱글턴 — 첫 호출 시 1회만 로드)
    # ------------------------------------------------------------------

    def _load_model(self):
        if self._model is not None:
            return

        try:
            import torch
            from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

            logger.info("모델 로딩: %s (첫 실행 시 다운로드)", self.model_name)
            self._tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self._model = AutoModelForSeq2SeqLM.from_pretrained(self.model_name)

            # GPU 사용 가능하면 이동
            if self._device == "cuda":
                try:
                    import torch
                    if torch.cuda.is_available():
                        self._model = self._model.cuda()
                        logger.info("GPU 사용")
                    else:
                        logger.info("GPU 미감지 — CPU 사용")
                        self._device = "cpu"
                except Exception:
                    self._device = "cpu"

            self._model.eval()
        except ImportError as e:
            raise ImportError(
                f"필요 패키지 미설치: {e}\n"
                "pip install transformers torch sentencepiece"
            )

    # ------------------------------------------------------------------
    # 청크 분할
    # ------------------------------------------------------------------

    def _chunk_text(self, text: str) -> List[str]:
        """
        토크나이저 기준으로 max_input_tokens 이하로 텍스트를 분할.
        문장 단위로 나누고 overlap 적용.
        """
        import re
        sentences = re.split(r"(?<=[.!?])\s+", text)
        sentences = [s.strip() for s in sentences if s.strip()]

        chunks: List[str] = []
        chunk_size = config.chunk_size
        overlap = config.chunk_overlap
        i = 0

        while i < len(sentences):
            chunk_sentences = sentences[i: i + chunk_size]
            chunk_text = " ".join(chunk_sentences)

            # 실제 토큰 수 확인
            token_len = len(self._tokenizer.encode(chunk_text))
            if token_len > config.max_input_tokens and len(chunk_sentences) > 1:
                # 청크가 너무 크면 절반으로 줄임
                chunk_size = max(1, chunk_size // 2)
                continue

            chunks.append(chunk_text)
            i += max(1, chunk_size - overlap)

        return chunks if chunks else [text[: config.max_input_tokens * 3]]

    # ------------------------------------------------------------------
    # 생성
    # ------------------------------------------------------------------

    def _generate(self, text: str, max_sentences: int) -> str:
        import torch

        inputs = self._tokenizer(
            text,
            return_tensors="pt",
            max_length=config.max_input_tokens,
            truncation=True,
        )

        if self._device == "cuda":
            inputs = {k: v.cuda() for k, v in inputs.items()}

        max_new_tokens = min(config.max_output_tokens, max_sentences * 80)

        with torch.no_grad():
            output_ids = self._model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                num_beams=4,
                length_penalty=1.2,
                no_repeat_ngram_size=3,
                early_stopping=True,
            )

        return self._tokenizer.decode(output_ids[0], skip_special_tokens=True)
