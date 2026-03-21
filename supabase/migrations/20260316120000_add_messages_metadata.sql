-- Add metadata JSONB column to messages table for storing tool_calls and tool results
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Add index for querying messages by metadata keys (e.g., tool role messages)
CREATE INDEX IF NOT EXISTS idx_messages_metadata_gin ON messages USING gin (metadata) WHERE metadata IS NOT NULL;
