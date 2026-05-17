-- NewsSnap Database Schema
-- Node.js 20 / MySQL 8.x 기준
-- 실행: mysql -u root -p newssnap < server/db/schema.sql

CREATE DATABASE IF NOT EXISTS newssnap
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE newssnap;

-- ============================================================
-- Users
-- name     : 시스템 내부 관리용 실명 (노출 금지)
-- nickname : 클라이언트에 노출되는 주력 식별자
-- ============================================================
CREATE TABLE IF NOT EXISTS Users (
  id            INT          UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL                         COMMENT '내부 관리용 실명 (클라이언트 비노출)',
  nickname      VARCHAR(50)  NOT NULL                         COMMENT '공개 식별자 — 클라이언트 응답 시 주력 사용',
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email    (email),
  UNIQUE KEY uq_users_nickname (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Summaries
-- keywords : JSON 배열 저장  (e.g. ["AI", "GPT-5", "OpenAI"])
-- source_url: 크롤링 원본 URL (직접 텍스트 입력 시 NULL)
-- ============================================================
CREATE TABLE IF NOT EXISTS Summaries (
  id          INT           UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT           UNSIGNED NOT NULL,
  title       VARCHAR(500)  NOT NULL,
  category    ENUM('AI','Tech','Business','Design') NOT NULL DEFAULT 'Tech',
  summary     TEXT          NOT NULL,
  keywords    JSON          NOT NULL,
  source_url  VARCHAR(2048)          DEFAULT NULL  COMMENT '크롤링 원본 URL',
  raw_content MEDIUMTEXT             DEFAULT NULL  COMMENT '크롤링/입력 원본 텍스트 (내부 저장용)',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_summaries_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,

  INDEX idx_summaries_user_id   (user_id),
  INDEX idx_summaries_category  (category),
  INDEX idx_summaries_created   (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
