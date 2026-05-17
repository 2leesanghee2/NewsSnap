import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import SummaryForm from "../components/SummaryForm.jsx";
import SummaryList from "../components/SummaryList.jsx";
import apiClient from "../api/axios.js";

const CATEGORIES = ["전체", "AI", "Tech", "Business", "Design"];

export default function Dashboard() {
  const { isLoggedIn, user } = useAuth();

  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("전체");

  const fetchSummaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get("/api/summaries");
      setSummaries(res.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/api/summaries/${id}`);
      setSummaries((prev) => prev.filter((s) => String(s.id) !== String(id)));
    } catch (err) {
      alert(err.message || "삭제 중 오류가 발생했습니다.");
    }
  };

  const handleSubmit = async ({ content, url }) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiClient.post("/api/summary", { content, url });
      setSummaries((prev) => [res.data.data, ...prev]);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSummaries = summaries.filter((item) => {
    const matchCategory =
      activeCategory === "전체" || item.category === activeCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      q === "" ||
      item.title.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      (Array.isArray(item.keywords) &&
        item.keywords.some((k) => k.toLowerCase().includes(q)));
    return matchCategory && matchSearch;
  });

  return (
    <main className="main-content">
      {/* 요약 폼 — 로그인 유저만 노출 */}
      <section className="form-section">
        {isLoggedIn ? (
          <>
            {/* nickname만 사용 — name 절대 사용 금지 */}
            <p className="dashboard-welcome">
              안녕하세요, <strong>{user.nickname}</strong>님 👋
            </p>
            <SummaryForm
              onSubmit={handleSubmit}
              submitting={submitting}
              submitError={submitError}
              categories={CATEGORIES.filter((c) => c !== "전체")}
            />
          </>
        ) : (
          <div className="auth-prompt">
            <div className="auth-prompt-inner">
              <span className="auth-prompt-icon">🔒</span>
              <div>
                <p className="auth-prompt-title">로그인하면 AI 요약을 직접 생성할 수 있습니다.</p>
                <p className="auth-prompt-desc">아래 목록은 누구나 볼 수 있습니다.</p>
              </div>
              <Link to="/login" className="auth-prompt-btn">
                로그인 / 회원가입
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* 요약 목록 — 공개 */}
      <section className="list-section">
        <SummaryList
          summaries={filteredSummaries}
          loading={loading}
          error={error}
          onRetry={fetchSummaries}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          categories={CATEGORIES}
          onDelete={handleDelete}
        />
      </section>
    </main>
  );
}
