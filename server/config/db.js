import mysql from "mysql2/promise";
import "dotenv/config";

const pool = mysql.createPool({
  host:              process.env.DB_HOST     || "localhost",
  port:              Number(process.env.DB_PORT) || 3306,
  user:              process.env.DB_USER     || "root",
  password:          process.env.DB_PASSWORD || "",
  database:          process.env.DB_NAME     || "newssnap",
  charset:           "utf8mb4",
  waitForConnections: true,
  connectionLimit:   10,
  queueLimit:        0,
  timezone:          "+00:00",
  decimalNumbers:    true,
});

/**
 * 서버 시작 시 DB 연결 검증 — 실패 시 프로세스 종료
 */
const testConnection = async () => {
  try {
    const conn = await pool.getConnection();
    console.log("[DB] MySQL 연결 성공");
    conn.release();
  } catch (err) {
    console.error("[DB] MySQL 연결 실패:", err.message);
    console.error("     → .env의 DB_HOST / DB_USER / DB_PASSWORD / DB_NAME 를 확인하세요.");
    process.exit(1);
  }
};

export { testConnection };
export default pool;
