import axios from "axios";

const TOKEN_KEY = "newssnap_token";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000",
  timeout: 150000,
  headers: {
    "Content-Type": "application/json",
  },
});

// 요청 인터셉터 — localStorage에서 토큰을 읽어 Authorization 헤더 자동 주입
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 응답 인터셉터 — 401 시 토큰 제거 후 로그인 페이지로 리다이렉트
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      // 이미 /login 이면 루프 방지
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    const message =
      error.response?.data?.message || "네트워크 오류가 발생했습니다.";
    return Promise.reject(new Error(message));
  }
);

export { TOKEN_KEY };
export default apiClient;
