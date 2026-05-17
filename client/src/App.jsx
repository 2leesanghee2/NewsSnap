import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import Header from "./components/Header.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Login from "./pages/Login.jsx";
import SummaryDetail from "./pages/SummaryDetail.jsx";

/**
 * 보호된 라우트 — 비로그인 시 /login 으로 리다이렉트
 */
const PrivateRoute = ({ children }) => {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? children : <Navigate to="/login" replace />;
};

/**
 * 로그인 상태에서 /login 접근 시 / 로 리다이렉트
 */
const PublicOnlyRoute = ({ children }) => {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? <Navigate to="/" replace /> : children;
};

const AppRoutes = () => (
  <div className="app-wrapper">
    <Header />
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        }
      />
      <Route path="/summary/:id" element={<SummaryDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <footer className="footer">
      <p>© 2026 NewsSnap. Powered by Claude AI.</p>
    </footer>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
