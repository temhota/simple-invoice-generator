CREATE TABLE IF NOT EXISTS ai_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  period_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_owner_access ON ai_usage;
CREATE POLICY ai_usage_owner_access ON ai_usage
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
