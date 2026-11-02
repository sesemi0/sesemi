-- run once:  npx wrangler d1 execute sesemi --remote --file migrations/001-user-accounts.sql
-- links existing project briefs to visitor accounts
ALTER TABLE leads ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS leads_user ON leads(user_id);
