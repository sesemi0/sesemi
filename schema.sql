-- SESEMI studio workspace schema (Cloudflare D1 / SQLite).
-- Apply locally:  npm run db:init
-- Apply remotely: npm run db:init:remote

CREATE TABLE IF NOT EXISTS owner (
  username  TEXT PRIMARY KEY,
  pass_hash TEXT NOT NULL,            -- pbkdf2$iterations$saltB64$hashB64
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  company    TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL,
  service    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'New',
  created_at TEXT NOT NULL,
  notes      TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT 'Website',
  follow_up  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at);

CREATE TABLE IF NOT EXISTS orders (
  id      TEXT PRIMARY KEY,
  lead_id TEXT,
  title   TEXT NOT NULL,
  client  TEXT NOT NULL,
  service TEXT NOT NULL,
  status  TEXT NOT NULL DEFAULT 'Planning',
  amount  REAL NOT NULL DEFAULT 0,
  due     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events (
  at         INTEGER NOT NULL,
  date       TEXT NOT NULL,
  name       TEXT NOT NULL,           -- page_view | assistant_open | brief_submitted
  path       TEXT NOT NULL,
  session_id TEXT NOT NULL,
  referrer   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS events_date ON events(date);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_throttle (
  key          TEXT PRIMARY KEY,      -- ip|username
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('studioName', '"SESEMI"'),
  ('replyEmail', '""'),
  ('notifications', 'false'),
  ('assistantInstructions', 'You are Sesemi, the guide of the SESEMI studio website. SESEMI is an independent digital and creative studio offering web design and development, AI advertising films, UI/UX design, AI-assisted video editing, logo and visual identity, and creative prompt engineering. Be warm, concise and honest. Never invent prices, delivery dates or client work. If a visitor wants to start a project, point them to the brief form or the contact section. Reply in the same language the visitor writes in.');

CREATE TABLE IF NOT EXISTS blog_posts (
  id           TEXT PRIMARY KEY,       -- canonical story URL
  url          TEXT NOT NULL,
  title_en     TEXT NOT NULL,
  title_fa     TEXT NOT NULL,
  summary_fa   TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  source       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS blog_posts_published ON blog_posts(published_at);

CREATE TABLE IF NOT EXISTS blog_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- visitor accounts (optional Google sign-in) — profiles + their own briefs
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,        -- U-xxxxxxxxxxxx
  google_sub TEXT UNIQUE NOT NULL,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  picture    TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_google_sub ON users(google_sub);

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,         -- sha256 of the cookie token
  user_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_user ON user_sessions(user_id);
