# NewsSnap 📰

뉴스 URL 또는 YouTube 링크를 입력하면 AI가 핵심 내용을 자동으로 요약해주는 풀스택 웹 서비스입니다.

<br>

## 주요 기능

- **뉴스 URL 요약** — 기사 링크 입력 시 본문을 크롤링해 핵심 문장 추출
- **YouTube 요약** — 영상 URL 입력 시 자막을 수집해 내용 요약
- **RSS 자동 수집** — AI · Tech · Business · Design 카테고리 뉴스 자동 업데이트
- **키워드 추출** — 본문에서 핵심 키워드 자동 태깅
- **북마크** — 관심 기사 저장 및 관리
- **검색 / 카테고리 필터** — 원하는 뉴스 빠르게 탐색
- **회원 인증** — JWT 기반 로그인 / 회원가입

<br>

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | React, Vite |
| 백엔드 | Node.js, Express.js |
| AI 서버 | Python, FastAPI, KR-SBERT, TextRank |
| 데이터베이스 | MySQL |
| 인증 | JWT |

<br>

## 아키텍처

```
클라이언트 (React :5173)
        ↓
Node.js 서버 (Express :4000)
        ↓
Python AI 서버 (FastAPI :8000)
```

요약 요청 시 Python AI 서버를 우선 호출하고, 서버가 꺼져 있거나 실패할 경우 Node.js 내장 TF-IDF 로직으로 자동 폴백합니다.

<br>

## 요약 파이프라인

```
본문 크롤링 → 문장 분리(kss) → KR-SBERT 임베딩
→ TextRank(PageRank) 중요도 산출
→ MMR 다양성 필터 → 띄어쓰기 후처리 → 결론 문장 추가
```

<br>

## 실행 방법

### 사전 준비

```bash
# Node.js 의존성 설치
cd server && npm install
cd ../client && npm install

# Python 의존성 설치
cd ../summarizer && pip install -r requirements.txt
```

### 환경변수 설정

`server/.env` 파일 생성:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=newssnap
JWT_SECRET=your_secret_key
PORT=4000
```

### 서버 실행

```powershell
# Windows PowerShell — 전체 한 번에 실행
.\start.ps1
```

또는 각각 실행:

```bash
# Python AI 서버
cd summarizer
python -X utf8 -m uvicorn api:app --host 0.0.0.0 --port 8000

# Node.js 서버
cd server
npm run dev

# React 클라이언트
cd client
npm run dev
```

| 서비스 | 주소 |
|--------|------|
| 클라이언트 | http://localhost:5173 |
| API 서버 | http://localhost:4000 |
| AI 서버 | http://localhost:8000 |

<br>

## 프로젝트 구조

```
NewsSnap/
├── client/          # React 프론트엔드
├── server/          # Node.js 백엔드
│   ├── services/
│   │   ├── summaryService.js   # 요약 · 크롤링 · TextRank
│   │   └── rssService.js       # RSS 수집
│   └── middlewares/
│       └── auth.js             # JWT 인증
├── summarizer/      # Python AI 서버
│   ├── api.py                  # FastAPI 엔드포인트
│   ├── extractive_summarizer.py  # TextRank + KR-SBERT
│   ├── preprocessor.py         # 텍스트 전처리
│   └── abstractive_summarizer.py # KoBART (선택)
└── start.ps1        # 전체 실행 스크립트
```
