-- Quota counters may only be mutated by the trusted server database role.
-- Migration 003 is replayed by the runner, so remove its write policy each time.
DROP POLICY IF EXISTS ai_usage_owner_access ON ai_usage;
DROP POLICY IF EXISTS ai_usage_owner_read ON ai_usage;
CREATE POLICY ai_usage_owner_read ON ai_usage
  FOR SELECT USING (auth.uid() = user_id);
