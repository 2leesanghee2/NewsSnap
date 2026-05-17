import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Header() {
  const { isLoggedIn, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="header-brand">
          <span className="header-logo">⚡</span>
          <span className="header-title">NewsSnap</span>
          <span className="header-badge">Beta</span>
        </Link>

        <div className="header-actions">
          {isLoggedIn ? (
            <>
              {/* 이름(name) 절대 사용 금지 — nickname만 표시 */}
              <span className="header-user">
                <span className="header-user-dot" />
                {user.nickname}
              </span>
              <button className="header-btn header-btn--ghost" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className={`header-btn header-btn--primary ${
                location.pathname === "/login" ? "header-btn--active" : ""
              }`}
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
