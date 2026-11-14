-- 003 — SESEMI Office mission bridge: agent work outputs reported back from the office app
CREATE TABLE IF NOT EXISTS agent_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_code TEXT DEFAULT '',
  task_title TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_role TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'done',
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_mission ON agent_outputs (mission_code);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_created ON agent_outputs (created_at);
