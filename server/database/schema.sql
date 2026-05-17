-- ============================================================
-- NewsSnap Database Schema v3.2
-- MySQL 8.x
-- 실행: mysql -u root -p < server/database/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS newssnap;
USE newssnap;

-- ============================================================
-- Users
-- name     : 내부 관리용 실명 (응답 비포함)
-- nickname : 클라이언트 노출용 식별자
-- ============================================================
CREATE TABLE IF NOT EXISTS Users (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100)  NOT NULL,
  nickname      VARCHAR(50)   NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_email    (email),
  UNIQUE KEY uq_nickname (nickname)
);

-- ============================================================
-- Summaries
-- ============================================================
CREATE TABLE IF NOT EXISTS Summaries (
  id         VARCHAR(32)   NOT NULL,
  user_id    INT UNSIGNED           DEFAULT NULL  COMMENT 'NULL = RSS 자동 수집, NOT NULL = 사용자 직접 등록',
  title      VARCHAR(500)  NOT NULL,
  category   ENUM('AI','Tech','Business','Design') NOT NULL DEFAULT 'Tech',
  summary    TEXT          NOT NULL,
  keywords   JSON          NOT NULL,
  source_url VARCHAR(2048)          DEFAULT NULL,
  source     VARCHAR(255)           DEFAULT NULL,
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_category (category),
  INDEX idx_created  (created_at DESC),
  INDEX idx_user_id  (user_id)
);

-- ============================================================
-- Bookmarks
-- FK 없이 인덱스만 사용 — 무결성은 서비스 레이어에서 관리
-- ============================================================
CREATE TABLE IF NOT EXISTS Bookmarks (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  summary_id VARCHAR(32)  NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE INDEX uq_summary_id (summary_id),
  INDEX idx_created (created_at DESC)
);
