import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const CATEGORY_COLOR = {
  AI: "badge-category--ai",
  Tech: "badge-category--tech",
  Business: "badge-category--business",
  Design: "badge-category--design",
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SummaryCard({ summary, onDelete }) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { id, title, category, summary: text, keywords, createdAt, authorNickname, isOwner } = summary;

  const parsedKeywords =
    typeof keywords === "string" ? JSON.parse(keywords) : keywords;

  const handleClick = () => {
    if (confirmDelete) return;
    navigate(`/summary/${id}`, { state: { summary } });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    setConfirmDelete(true);
  };

  const handleDeleteConfirm = async (e) => {
    e.stopPropagation();
    setDeleting(true);
    try {
      await onDelete(id);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleDeleteCancel = (e) => {
    e.stopPropagation();
    setConfirmDelete(false);
  };

  return (
    <article
      className="summary-card"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${title} 상세 보기`}
    >
      <div className="summary-card-top">
        <span
          className={`badge-category ${CATEGORY_COLOR[category] || "badge-category--tech"}`}
        >
          {category}
        </span>
        <div className="summary-card-top-right">
          <time className="summary-card-date" dateTime={createdAt}>
            {formatDate(createdAt)}
          </time>
          {onDelete && isOwner && !confirmDelete && (
            <button
              className="card-delete-btn"
              onClick={handleDeleteClick}
              aria-label="요약 삭제"
              title="삭제"
            >
              🗑
            </button>
          )}
          {confirmDelete && (
            <div className="card-delete-confirm">
              <span className="card-delete-confirm-text">삭제할까요?</span>
              <button
                className="card-delete-confirm-yes"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? "..." : "삭제"}
              </button>
              <button
                className="card-delete-confirm-no"
                onClick={handleDeleteCancel}
              >
                취소
              </button>
            </div>
          )}
        </div>
      </div>

      <h3 className="summary-card-title">{title}</h3>

      <p className="summary-card-text">
        {text.split("\n").filter(Boolean).slice(0, 2).join(" ")}
      </p>

      {/* 작성자 — nickname만 표시, name 절대 사용 금지 */}
      {authorNickname && (
        <p className="summary-card-author">by {authorNickname}</p>
      )}

      <div className="summary-card-keywords">
        {parsedKeywords.slice(0, 4).map((kw) => (
          <span key={kw} className="badge-keyword">
            # {kw}
          </span>
        ))}
        {parsedKeywords.length > 4 && (
          <span className="badge-keyword badge-keyword--more">
            +{parsedKeywords.length - 4}
          </span>
        )}
      </div>

      <div className="summary-card-footer">
        <span className="summary-card-read-more">자세히 보기 →</span>
      </div>
    </article>
  );
}
