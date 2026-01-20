PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS timeline_cache (
  user_did TEXT NOT NULL,
  cursor_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  PRIMARY KEY (user_did, cursor_key)
);

CREATE TABLE IF NOT EXISTS profile_cache (
  user_did TEXT NOT NULL,
  handle TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  PRIMARY KEY (user_did, handle)
);

CREATE TABLE IF NOT EXISTS notifications_cache (
  user_did TEXT NOT NULL,
  cursor_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  PRIMARY KEY (user_did, cursor_key)
);

CREATE TABLE IF NOT EXISTS post_drafts (
  draft_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_retry_queue (
  id TEXT PRIMARY KEY,
  user_did TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_post_retry_queue_due
  ON post_retry_queue(status, next_retry_at);
