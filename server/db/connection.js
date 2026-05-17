import mysql from "mysql2/promise";
import "dotenv/config";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "newssnap",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "+00:00",
  decimalNumbers: true,
});

export const testConnection = async () => {
  try {
    const conn = await pool.getConnection();
    console.log("[DB] MySQL 연결 성공 — pool 준비 완료");
    conn.release();
  } catch (err) {
    console.error("[DB] MySQL 연결 실패:", err.message);
    process.exit(1);
  }
};

export default pool;
