import React, { useState } from "react";

const INPUT_MODES = [
  { key: "url", label: "🔗 URL 입력" },
  { key: "text", label: "📝 직접 입력" },
];

export default function SummaryForm({ onSubmit, submitting, submitError, categories }) {
  const [mode, setMode] = useState("url");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === "url") {
      onSubmit({ url, content: "" });
    } else {
      onSubmit({ url: "", content });
    }
  };

  const isDisabled =
    submitting ||
    (mode === "url" && !url.trim()) ||
    (mode === "text" && !content.trim());

  const handleReset = () => {
    setUrl("");
    setContent("");
  };

  return (
    <div className="form-card">
      <div className="form-card-header">
        <h2 className="form-card-title">새 뉴스 요약 추가</h2>
        <p className="form-card-desc">
          URL을 붙여넣거나 기사 본문을 직접 입력하면 Claude AI가 자동으로 요약합니다.
        </p>
      </div>

      {/* 입력 모드 탭 */}
      <div className="form-mode-tabs">
        {INPUT_MODES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`form-mode-tab ${mode === key ? "form-mode-tab--active" : ""}`}
            onClick={() => {
              setMode(key);
              handleReset();
            }}
            disabled={submitting}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="summary-form">
        {mode === "url" ? (
          <div className="form-group">
            <label className="form-label" htmlFor="news-url">
              뉴스 URL <span className="form-label-required">*</span>
            </label>
            <input
              id="news-url"
              type="url"
              className="form-input"
              placeholder="https://example.com/news/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={submitting}
              required
            />
            <span className="form-hint">
              기사 URL을 붙여넣으면 본문을 자동으로 추출합니다.
            </span>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label" htmlFor="news-content">
              뉴스 본문 <span className="form-label-required">*</span>
            </label>
            <textarea
              id="news-content"
              className="form-textarea"
              placeholder="기사 본문을 붙여넣으세요..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={submitting}
              rows={5}
              required
            />
          </div>
        )}

        {submitError && (
          <div className="form-error-banner">
            <span className="form-error-icon">⚠</span>
            {submitError}
          </div>
        )}

        <button
          type="submit"
          className={`form-submit-btn ${submitting ? "form-submit-btn--loading" : ""}`}
          disabled={isDisabled}
        >
          {submitting ? (
            <>
              <span className="btn-spinner" />
              AI 요약 중... (최대 30초)
            </>
          ) : (
            <>
              <span>⚡</span>
              AI 요약하기
            </>
          )}
        </button>
      </form>
    </div>
  );
}
