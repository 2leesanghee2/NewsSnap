from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Config:
    # 디바이스: "cuda" 또는 "cpu"
    device: str = "cpu"

    # 추출 요약
    extractive_top_n: int = 8
    use_sbert: bool = True
    sbert_model: str = "snunlp/KR-SBERT-V40K-klueNLI-augSTS"
    pagerank_damping: float = 0.85
    position_bonus_ratio: float = 0.4   # 앞 40% 문장에 가중치
    position_bonus_weight: float = 1.2
    mmr_threshold: float = 0.30         # 이 이상 겹치면 중복으로 판단 (낮출수록 다양성↑)

    # 추상 요약
    abstractive_model: str = "digit82/kobart-summarization"
    max_input_tokens: int = 1024
    max_output_tokens: int = 256
    chunk_size: int = 10                # 청크당 문장 수
    chunk_overlap: int = 2              # 청크 간 겹치는 문장 수

    # 출력
    output_dir: Path = field(default_factory=lambda: Path("./outputs"))


config = Config()
