CREATE TABLE IF NOT EXISTS episode_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  reader_key TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL,
  UNIQUE(work_id, episode_id, reader_key)
);

CREATE INDEX IF NOT EXISTS episode_comments_thread
  ON episode_comments(work_id, episode_id, id DESC);
