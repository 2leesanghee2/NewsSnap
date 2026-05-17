import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { testConnection } from "./config/db.js";
import pool from "./config/db.js";
import { authenticate, optionalAuth } from "./middlewares/auth.js";
import {
  getAllSummaries,
  createSummary,
  toggleBookmark,
  getBookmarks,
  deleteSummary,
} from "./services/summaryService.js";

const JWT_SECRET     = process.env.JWT_SECRET     || "newssnap_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const BCRYPT_ROUNDS  = 10;

const app = express();
const PORT       = process.env.PORT       || 4000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// ============================================================
// 글로벌 미들웨어
// ============================================================
app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "2mb" }));

// ============================================================
// 헬스 체크
// ============================================================
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ============================================================
// POST /api/auth/register
// body: { name, nickname, email, password }
// ============================================================
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, nickname, email, password } = req.body;

    if (!name || !nickname || !email || !password) {
      return res.status(400).json({ success: false, message: "모든 항목을 입력해주세요." });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "비밀번호는 8자 이상이어야 합니다." });
    }

    const [existing] = await pool.query(
      "SELECT id FROM Users WHERE email = ? OR nickname = ? LIMIT 1",
      [email.trim().toLowerCase(), nickname.trim()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "이미 사용 중인 이메일 또는 닉네임입니다." });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [result] = await pool.query(
      "INSERT INTO Users (name, nickname, email, password_hash) VALUES (?, ?, ?, ?)",
      [name.trim(), nickname.trim(), email.trim().toLowerCase(), passwordHash]
    );

    const token = jwt.sign({ userId: result.insertId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: result.insertId, nickname: nickname.trim(), email: email.trim().toLowerCase() },
      },
    });
  } catch (err) {
    console.error("[POST /api/auth/register]", err.message);
    res.status(500).json({ success: false, message: "회원가입 처리 중 오류가 발생했습니다." });
  }
});

// ============================================================
// POST /api/auth/login
// body: { email, password }
// ============================================================
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "이메일과 비밀번호를 입력해주세요." });
    }

    const [rows] = await pool.query(
      "SELECT id, nickname, email, password_hash FROM Users WHERE email = ? LIMIT 1",
      [email.trim().toLowerCase()]
    );
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "이메일 또는 비밀번호가 올바르지 않습니다." });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "이메일 또는 비밀번호가 올바르지 않습니다." });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, nickname: user.nickname, email: user.email },
      },
    });
  } catch (err) {
    console.error("[POST /api/auth/login]", err.message);
    res.status(500).json({ success: false, message: "로그인 처리 중 오류가 발생했습니다." });
  }
});

// ============================================================
// GET /api/summaries
// query: ?category=AI|Tech|Business|Design  &search=키워드
// RSS → DB Upsert → DB 조회 (bookmarked 포함) → 반환
// ============================================================
app.get("/api/summaries", optionalAuth, async (req, res) => {
  try {
    const { category, search } = req.query;
    const summaries = await getAllSummaries({
      category,
      search,
      requestingUserId: req.user?.id ?? null,
    });
    res.json({ success: true, data: summaries, count: summaries.length });
  } catch (err) {
    console.error("[GET /api/summaries]", err.message);
    res.status(500).json({
      success: false,
      message: "뉴스 데이터를 불러오는 중 오류가 발생했습니다.",
    });
  }
});

// ============================================================
// POST /api/summary
// body: { url?, content? }
// 사용자 입력 → 로컬 처리 → DB 저장 → 반환
// ============================================================
app.post("/api/summary", authenticate, async (req, res) => {
  try {
    const { url, content } = req.body;

    if ((!url || !String(url).trim()) && (!content || !String(content).trim())) {
      return res.status(400).json({
        success: false,
        message: "뉴스 URL 또는 본문 텍스트 중 하나는 반드시 입력해야 합니다.",
      });
    }

    const result = await createSummary({ url, content, userId: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error("[POST /api/summary]", err.message);
    const isClientError =
      err.message.includes("URL") ||
      err.message.includes("추출") ||
      err.message.includes("입력");
    res.status(isClientError ? 400 : 500).json({
      success: false,
      message: err.message || "요약 처리 중 오류가 발생했습니다.",
    });
  }
});

// ============================================================
// GET /api/bookmarks
// 북마크된 요약 전체 조회
// ============================================================
app.get("/api/bookmarks", async (_req, res) => {
  try {
    const bookmarks = await getBookmarks();
    res.json({ success: true, data: bookmarks, count: bookmarks.length });
  } catch (err) {
    console.error("[GET /api/bookmarks]", err.message);
    res.status(500).json({
      success: false,
      message: "북마크 목록을 불러오는 중 오류가 발생했습니다.",
    });
  }
});

// ============================================================
// POST /api/bookmarks/:id
// 북마크 토글 — 없으면 추가, 있으면 삭제
// ============================================================
app.post("/api/bookmarks/:id", async (req, res) => {
  try {
    const summaryId = req.params.id;
    if (!summaryId) {
      return res.status(400).json({ success: false, message: "summary ID가 필요합니다." });
    }

    const result = await toggleBookmark(summaryId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[POST /api/bookmarks/:id]", err.message);
    const isNotFound = err.message.includes("존재하지 않는");
    res.status(isNotFound ? 404 : 500).json({
      success: false,
      message: err.message || "북마크 처리 중 오류가 발생했습니다.",
    });
  }
});

// ============================================================
// DELETE /api/bookmarks/:id
// 북마크 명시적 삭제
// ============================================================
app.delete("/api/bookmarks/:id", async (req, res) => {
  try {
    const summaryId = req.params.id;
    const result = await toggleBookmark(summaryId);
    // 이미 삭제된 상태라면 bookmarked: false 를 그대로 반환
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[DELETE /api/bookmarks/:id]", err.message);
    res.status(500).json({
      success: false,
      message: err.message || "북마크 삭제 중 오류가 발생했습니다.",
    });
  }
});

// ============================================================
// DELETE /api/summaries/:id
// ============================================================
app.delete("/api/summaries/:id", authenticate, async (req, res) => {
  try {
    await deleteSummary(req.params.id, req.user.id);
    res.json({ success: true, message: "요약이 삭제되었습니다." });
  } catch (err) {
    console.error("[DELETE /api/summaries/:id]", err.message);
    const status =
      err.message.includes("존재하지 않는") ? 404 :
      err.message.includes("본인이") || err.message.includes("RSS") ? 403 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
});

// ============================================================
// 전역 404 / 에러 핸들러
// ============================================================
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "요청한 리소스를 찾을 수 없습니다." });
});

app.use((err, _req, res, _next) => {
  console.error("[Unhandled Error]", err);
  res.status(500).json({ success: false, message: "예상치 못한 서버 오류가 발생했습니다." });
});

// ============================================================
// 서버 시작 — DB 연결 검증 후 listen
// ============================================================
const start = async () => {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`NewsSnap API  →  http://localhost:${PORT}`);
    console.log(`허용 오리진    →  ${CLIENT_URL}`);
  });
};

start();
