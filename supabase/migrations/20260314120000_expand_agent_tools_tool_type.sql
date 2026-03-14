-- Expand agent_tools.tool_type check constraint to include google surfaces
-- Previous constraint likely only allowed: crm, whatsapp, salesforce, hubspot, etc.
-- Adding: gmail, google_calendar

ALTER TABLE agent_tools
  DROP CONSTRAINT IF EXISTS agent_tools_tool_type_check;

ALTER TABLE agent_tools
  ADD CONSTRAINT agent_tools_tool_type_check
  CHECK (tool_type IN (
    'crm',
    'whatsapp',
    'salesforce',
    'hubspot',
    'gmail',
    'google_calendar'
  ));
