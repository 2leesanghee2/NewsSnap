"""
main.py — CLI 진입점

사용 예:
    python main.py --input 뉴스.txt --mode extractive --sentences 5
    python main.py --input 강의.srt --mode abstractive --sentences 3
    python main.py --input 영상.vtt --mode hybrid --sentences 4
"""

import argparse
import logging
import sys
import io
from pathlib import Path

# Windows 콘솔 UTF-8 출력 강제
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from config import config
from preprocessor import Preprocessor
from extractive_summarizer import ExtractiveSummarizer
from abstractive_summarizer import AbstractiveSummarizer

logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# 출력 저장
# ------------------------------------------------------------------

def save_result(text: str, mode: str) -> Path:
    config.output_dir.mkdir(parents=True, exist_ok=True)
    out_path = config.output_dir / f"summary_{mode}.txt"
    out_path.write_text(text, encoding="utf-8")
    return out_path


# ------------------------------------------------------------------
# 모드별 처리
# ------------------------------------------------------------------

def run_extractive(sentences, top_n: int) -> str:
    summarizer = ExtractiveSummarizer()
    result = summarizer.summarize(sentences, top_n=top_n)
    return "\n".join(f"{i+1}. {s}" for i, s in enumerate(result))


def run_abstractive(sentences, max_sentences: int) -> str:
    full_text = " ".join(sentences)
    summarizer = AbstractiveSummarizer()
    return summarizer.summarize(full_text, max_sentences=max_sentences)


def run_hybrid(sentences, top_n: int, max_sentences: int) -> str:
    # 1단계: TextRank로 핵심 문장 추출 (top_n * 2 개 뽑아서 LLM 입력 품질 향상)
    ext = ExtractiveSummarizer()
    key_sentences = ext.summarize(sentences, top_n=min(top_n * 2, len(sentences)))
    logger.info("TextRank 추출 완료 (%d문장) → 추상 요약 생성 중...", len(key_sentences))

    # 2단계: 추출된 핵심 문장만 LLM에 입력
    abst = AbstractiveSummarizer()
    return abst.summarize(" ".join(key_sentences), max_sentences=max_sentences)


# ------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="한국어 텍스트/자막 로컬 요약 도구",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--input", "-i", required=True,
        help="입력 파일 경로 (.txt / .srt / .vtt)",
    )
    parser.add_argument(
        "--mode", "-m",
        choices=["extractive", "abstractive", "hybrid"],
        default="extractive",
        help=(
            "요약 방식\n"
            "  extractive  — TextRank 추출 요약 (빠름)\n"
            "  abstractive — KoBART 생성 요약 (느리지만 자연스러움)\n"
            "  hybrid      — 추출 후 생성 (품질 최고, 가장 느림)"
        ),
    )
    parser.add_argument(
        "--sentences", "-n", type=int, default=5,
        help="요약 문장 수 (기본값: 5)",
    )
    parser.add_argument(
        "--no-sbert", action="store_true",
        help="SBERT 사용 안 함 (TF-IDF fallback, 빠르지만 품질 낮음)",
    )
    parser.add_argument(
        "--device", choices=["cpu", "cuda"], default=None,
        help="사용 디바이스 (기본값: config.device)",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    # 런타임 config 오버라이드
    if args.no_sbert:
        config.use_sbert = False
    if args.device:
        config.device = args.device

    # 전처리
    preprocessor = Preprocessor()
    try:
        sentences = preprocessor.load(args.input)
    except (FileNotFoundError, ValueError) as e:
        logger.error(str(e))
        sys.exit(1)

    if not sentences:
        logger.error("문장이 추출되지 않았습니다. 파일을 확인해주세요.")
        sys.exit(1)

    # 요약
    mode = args.mode
    n = args.sentences
    logger.info("모드: %s | 목표 문장 수: %d", mode, n)

    try:
        if mode == "extractive":
            result = run_extractive(sentences, top_n=n)
        elif mode == "abstractive":
            result = run_abstractive(sentences, max_sentences=n)
        else:
            result = run_hybrid(sentences, top_n=n, max_sentences=n)
    except Exception as e:
        logger.error("요약 중 오류 발생: %s", e)
        sys.exit(1)

    # 출력 및 저장
    print("\n" + "=" * 60)
    print(f"[{mode.upper()} 요약 결과]")
    print("=" * 60)
    print(result)
    print("=" * 60)

    out_path = save_result(result, mode)
    logger.info("저장 완료: %s", out_path)


if __name__ == "__main__":
    main()
