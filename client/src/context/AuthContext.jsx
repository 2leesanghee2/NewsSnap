import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { TOKEN_KEY } from "../api/axios.js";

/**
 * AuthContext
 * - token     : JWT 문자열 (null = 비로그인)
 * - user      : { id, nickname, email }  — name은 절대 포함하지 않음
 * - login()   : 토큰·유저 저장
 * - logout()  : 토큰·유저 초기화
 * - isLoggedIn: 파생 불리언
 */
const AuthContext = createContext(null);

const USER_KEY = "newssnap_user";

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // 토큰이 있으면 유저 정보도 복원되어야 하고, 없으면 user도 null
  useEffect(() => {
    if (!token) {
      setUser(null);
      localStorage.removeItem(USER_KEY);
    }
  }, [token]);

  /**
   * login({ token, user })
   * user = { id, nickname, email }
   * nickname만 저장 — name은 받더라도 저장하지 않음
   */
  const login = useCallback(({ token: newToken, user: rawUser }) => {
    const safeUser = {
      id: rawUser.id,
      nickname: rawUser.nickname,   // 주력 식별자
      email: rawUser.email,
    };
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(safeUser));
    setToken(newToken);
    setUser(safeUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = {
    token,
    user,          // { id, nickname, email }
    isLoggedIn: !!token,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 내부에서 사용해야 합니다.");
  return ctx;
};

export default AuthContext;
