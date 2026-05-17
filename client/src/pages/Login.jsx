import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import apiClient from "../api/axios.js";

const TABS = ["login", "register"];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 로그인 필드
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });

  // 회원가입 필드
  const [registerForm, setRegisterForm] = useState({
    name: "",
    nickname: "",
    email: "",
    password: "",
    passwordConfirm: "",
  });

  const updateLogin = (e) =>
    setLoginForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const updateRegister = (e) =>
    setRegisterForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiClient.post("/api/auth/login", {
        email: loginForm.email.trim(),
        password: loginForm.password,
      });
      // user = { id, nickname, email } — name은 포함되지 않으며 저장하지 않음
      login({ token: res.data.data.token, user: res.data.data.user });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);

    if (registerForm.password !== registerForm.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (registerForm.password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post("/api/auth/register", {
        name: registerForm.name.trim(),
        nickname: registerForm.nickname.trim(),
        email: registerForm.email.trim(),
        password: registerForm.password,
      });
      login({ token: res.data.data.token, user: res.data.data.user });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-card-header">
          <h1 className="auth-title">
            {tab === "login" ? "다시 돌아오셨군요 👋" : "NewsSnap 시작하기 🚀"}
          </h1>
          <p className="auth-desc">
            {tab === "login"
              ? "이메일과 비밀번호로 로그인하세요."
              : "계정을 만들고 AI 뉴스 요약을 시작하세요."}
          </p>
        </div>

        {/* 탭 */}
        <div className="auth-tabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={`auth-tab ${tab === t ? "auth-tab--active" : ""}`}
              onClick={() => {
                setTab(t);
                setError(null);
              }}
            >
              {t === "login" ? "로그인" : "회원가입"}
            </button>
          ))}
        </div>

        {/* 에러 배너 */}
        {error && (
          <div className="form-error-banner">
            <span className="form-error-icon">⚠</span>
            {error}
          </div>
        )}

        {/* 로그인 폼 */}
        {tab === "login" && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">
                이메일
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                className="form-input"
                placeholder="example@email.com"
                value={loginForm.email}
                onChange={updateLogin}
                disabled={loading}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="login-password">
                비밀번호
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                className="form-input"
                placeholder="비밀번호 입력"
                value={loginForm.password}
                onChange={updateLogin}
                disabled={loading}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className={`auth-submit-btn ${loading ? "form-submit-btn--loading" : ""}`}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="btn-spinner" />
                  로그인 중...
                </>
              ) : (
                "로그인"
              )}
            </button>
          </form>
        )}

        {/* 회원가입 폼 */}
        {tab === "register" && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="form-row--two">
              <div className="form-group">
                <label className="form-label" htmlFor="reg-name">
                  이름 <span className="form-label-required">*</span>
                </label>
                <input
                  id="reg-name"
                  name="name"
                  type="text"
                  className="form-input"
                  placeholder="홍길동"
                  value={registerForm.name}
                  onChange={updateRegister}
                  disabled={loading}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-nickname">
                  닉네임 <span className="form-label-required">*</span>
                  <span className="form-label-hint"> (공개 표시)</span>
                </label>
                <input
                  id="reg-nickname"
                  name="nickname"
                  type="text"
                  className="form-input"
                  placeholder="newshunter"
                  value={registerForm.nickname}
                  onChange={updateRegister}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-email">
                이메일 <span className="form-label-required">*</span>
              </label>
              <input
                id="reg-email"
                name="email"
                type="email"
                className="form-input"
                placeholder="example@email.com"
                value={registerForm.email}
                onChange={updateRegister}
                disabled={loading}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-row--two">
              <div className="form-group">
                <label className="form-label" htmlFor="reg-password">
                  비밀번호 <span className="form-label-required">*</span>
                </label>
                <input
                  id="reg-password"
                  name="password"
                  type="password"
                  className="form-input"
                  placeholder="8자 이상"
                  value={registerForm.password}
                  onChange={updateRegister}
                  disabled={loading}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-password-confirm">
                  비밀번호 확인 <span className="form-label-required">*</span>
                </label>
                <input
                  id="reg-password-confirm"
                  name="passwordConfirm"
                  type="password"
                  className="form-input"
                  placeholder="비밀번호 재입력"
                  value={registerForm.passwordConfirm}
                  onChange={updateRegister}
                  disabled={loading}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              className={`auth-submit-btn ${loading ? "form-submit-btn--loading" : ""}`}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="btn-spinner" />
                  가입 중...
                </>
              ) : (
                "계정 만들기"
              )}
            </button>
          </form>
        )}

        <p className="auth-footer-text">
          <Link to="/" className="auth-link">
            ← 대시보드로 돌아가기
          </Link>
        </p>
      </div>
    </main>
  );
}
