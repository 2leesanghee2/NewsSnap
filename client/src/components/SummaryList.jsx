import React from "react";
import SummaryCard from "./SummaryCard.jsx";

export default function SummaryList({
  summaries,
  loading,
  error,
  onRetry,
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  categories,
  onDelete,
}) {
  return (
    <div className="list-container">
      <div className="list-toolbar">
        <div className="list-toolbar-left">
          <h2 className="list-title">요약 대시보드</h2>
          <span className="list-count">{summaries.length}건</span>
        </div>

        <div className="list-toolbar-right">
          <div className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="제목, 내용, 키워드 검색..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button
                className="search-clear"
                onClick={() => onSearchChange("")}
                aria-label="검색어 지우기"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="category-filter">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`category-btn ${activeCategory === cat ? "category-btn--active" : ""}`}
            onClick={() => onCategoryChange(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading && (
        <div className="state-container">
          <div className="skeleton-grid">
            {[1, 2, 3].map((n) => (
              <div key={n} className="skeleton-card">
                <div className="skeleton skeleton--badge" />
                <div className="skeleton skeleton--title" />
                <div className="skeleton skeleton--line" />
                <div className="skeleton skeleton--line skeleton--short" />
                <div className="skeleton skeleton--keywords" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="state-container state-container--center">
          <div className="state-icon">⚠️</div>
          <p className="state-message">{error}</p>
          <button className="retry-btn" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      )}

      {!loading && !error && summaries.length === 0 && (
        <div className="state-container state-container--center">
          <div className="state-icon">📭</div>
          <p className="state-message">
            {searchQuery || activeCategory !== "전체"
              ? "검색 결과가 없습니다."
              : "아직 요약된 뉴스가 없습니다. 첫 번째 뉴스를 추가해보세요!"}
          </p>
        </div>
      )}

      {!loading && !error && summaries.length > 0 && (
        <div className="summary-grid">
          {summaries.map((item) => (
            <SummaryCard key={item.id} summary={item} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
