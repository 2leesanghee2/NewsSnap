import jwt from "jsonwebtoken";
import pool from "../config/db.js";

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * JWT 필수 인증 미들웨어
 * 토큰 없거나 유효하지 않으면 401 반환
 */
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }

    const token = header.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      const msg = err.name === "TokenExpiredError"
        ? "토큰이 만료되었습니다. 다시 로그인해주세요."
        : "유효하지 않은 토큰입니다.";
      return res.status(401).json({ success: false, message: msg });
    }

    const [rows] = await pool.query(
      "SELECT id, nickname, email FROM Users WHERE id = ? LIMIT 1",
      [decoded.userId]
    );
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "존재하지 않는 사용자입니다." });
    }

    req.user = { id: rows[0].id, nickname: rows[0].nickname, email: rows[0].email };
    next();
  } catch (err) {
    console.error("[authenticate]", err.message);
    res.status(500).json({ success: false, message: "인증 처리 중 오류가 발생했습니다." });
  }
};

/**
 * JWT 선택적 인증 미들웨어
 * 토큰이 있으면 req.user 를 설정하고, 없어도 통과
 */
const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return next();

    const token = header.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return next(); // 토큰이 잘못돼도 선택적이므로 통과
    }

    const [rows] = await pool.query(
      "SELECT id, nickname, email FROM Users WHERE id = ? LIMIT 1",
      [decoded.userId]
    );
    if (rows.length > 0) {
      req.user = { id: rows[0].id, nickname: rows[0].nickname, email: rows[0].email };
    }
    next();
  } catch (err) {
    console.error("[optionalAuth]", err.message);
    next();
  }
};

export { authenticate, optionalAuth };
