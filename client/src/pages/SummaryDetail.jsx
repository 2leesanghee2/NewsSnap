import React, { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate, Link } from "react-router-dom";
import apiClient from "../api/axios.js";

const CATEGORY_COLOR = {
  AI: "badge-category--ai",
  Tech: "badge-category--tech",
  Business: "badge-category--business",
  Design: "badge-category--design",
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SummaryDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // 목록 클릭 시 router state로 받은 데이터 우선 사용
  const [summary, setSummary] = useState(location.state?.summary || null);
  const [loading, setLoading] = useState(!summary);
  const [error, setError] = useState(null);

  useEffect(() => {
    // state로 데이터가 없으면 전체 목록에서 id로 조회 (직접 URL 접근 대응)
    if (summary) return;

    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get("/api/summaries");
        const found = res.data.data.find((s) => String(s.id) === String(id));
        if (!found) {
          setError("해당 요약을 찾을 수 없습니다.");
        } else {
          setSummary(found);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [id, summary]);

  if (loading) {
    return (
      <main className="main-content">
        <div className="detail-page">
          <div className="detail-skeleton">
            <div className="skeleton skeleton--badge" style={{ marginBottom: 16 }} />
            <div className="skeleton skeleton--title" style={{ height: 32, marginBottom: 12 }} />
            <div className="skeleton skeleton--line" style={{ marginBottom: 8 }} />
            <div className="skeleton skeleton--line skeleton--short" style={{ marginBottom: 8 }} />
            <div className="skeleton skeleton--line" />
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="main-content">
        <div className="detail-page">
          <div className="state-container state-container--center">
            <div className="state-icon">⚠️</div>
            <p className="state-message">{error}</p>
            <button className="retry-btn" onClick={() => navigate("/")}>
              대시보드로 돌아가기
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!summary) return null;

  const keywords =
    typeof summary.keywords === "string"
      ? JSON.parse(summary.keywords)
      : summary.keywords;

  return (
    <main className="main-content">
      <div className="detail-page">
        {/* 뒤로가기 */}
        <Link to="/" className="detail-back">
          ← 대시보드로
        </Link>

        <article className="detail-card">
          {/* 상단 메타 */}
          <header className="detail-header">
            <div className="detail-meta">
              <span
                className={`badge-category ${CATEGORY_COLOR[summary.category] || "badge-category--tech"}`}
              >
                {summary.category}
              </span>
              <time className="detail-date" dateTime={summary.createdAt}>
                {formatDate(summary.createdAt)}
              </time>
            </div>

            <h1 className="detail-title">{summary.title}</h1>

            {/* 작성자 — nickname만 표시, name 절대 사용 금지 */}
            {summary.authorNickname && (
              <p className="detail-author">
                <span className="detail-author-label">작성자</span>
                <span className="detail-author-nickname">{summary.authorNickname}</span>
              </p>
            )}
          </header>

          {/* 구분선 */}
          <hr className="detail-divider" />

          {/* AI 요약 본문 */}
          <section className="detail-summary-section">
            <h2 className="detail-section-title">
              <span className="detail-section-icon">⚡</span>AI 요약
            </h2>
            <div className="detail-summary-text">
              {summary.summary.split("\n").filter(Boolean).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </section>

          {/* 키워드 */}
          <section className="detail-keywords-section">
            <h2 className="detail-section-title">
              <span className="detail-section-icon">#</span>키워드
            </h2>
            <div className="detail-keywords">
              {keywords.map((kw) => (
                <span key={kw} className="badge-keyword badge-keyword--lg">
                  # {kw}
                </span>
              ))}
            </div>
          </section>

          {/* 원문 링크 */}
          {summary.sourceUrl && (
            <section className="detail-source-section">
              <h2 className="detail-section-title">
                <span className="detail-section-icon">🔗</span>원문 출처
              </h2>
              <a
                href={summary.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="detail-source-link"
              >
                <span className="detail-source-domain">
                  {new URL(summary.sourceUrl).hostname}
                </span>
                <span className="detail-source-arrow">↗</span>
              </a>
            </section>
          )}
        </article>
      </div>
    </main>
  );
}
