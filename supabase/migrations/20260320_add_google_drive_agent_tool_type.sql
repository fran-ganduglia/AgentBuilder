-- Expand agent_tools.tool_type check constraint to include google_drive

alter table public.agent_tools
  drop constraint if exists agent_tools_tool_type_check;

alter table public.agent_tools
  add constraint agent_tools_tool_type_check
  check (
    tool_type in (
      'crm',
      'whatsapp',
      'email',
      'gmail',
      'google_calendar',
      'google_sheets',
      'google_drive'
    )
  );
