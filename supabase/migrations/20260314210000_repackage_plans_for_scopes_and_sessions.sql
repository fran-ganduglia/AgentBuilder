DO $$
DECLARE
  pro_plan_id UUID;
  growth_plan_id UUID;
BEGIN
  SELECT id INTO pro_plan_id
  FROM plans
  WHERE name = 'pro'
  LIMIT 1;

  SELECT id INTO growth_plan_id
  FROM plans
  WHERE name = 'growth'
  LIMIT 1;

  IF pro_plan_id IS NOT NULL AND growth_plan_id IS NULL THEN
    UPDATE plans
    SET name = 'growth'
    WHERE id = pro_plan_id;
  ELSIF pro_plan_id IS NOT NULL AND growth_plan_id IS NOT NULL THEN
    UPDATE organizations
    SET plan_id = growth_plan_id
    WHERE plan_id = pro_plan_id;

    DELETE FROM plans
    WHERE id = pro_plan_id;
  END IF;
END $$;

UPDATE plans
SET
  price_monthly_usd = 0.00,
  max_users = 1,
  features = COALESCE(features, '{}'::jsonb) || '{
    "public_label": "Trial",
    "max_scopes_active": 1,
    "max_sessions_month": 100,
    "max_integrations_per_agent": 1,
    "max_active_agents_per_scope": 1,
    "workflows_unlimited": false,
    "integrations_unlimited": false
  }'::jsonb
WHERE name = 'trial';

UPDATE plans
SET
  price_monthly_usd = 39.00,
  max_users = 2,
  features = COALESCE(features, '{}'::jsonb) || '{
    "public_label": "Starter",
    "max_scopes_active": 1,
    "max_sessions_month": 300,
    "max_integrations_per_agent": null,
    "max_active_agents_per_scope": 1,
    "workflows_unlimited": true,
    "integrations_unlimited": true
  }'::jsonb
WHERE name = 'starter';

UPDATE plans
SET
  price_monthly_usd = 99.00,
  max_users = 5,
  features = COALESCE(features, '{}'::jsonb) || '{
    "public_label": "Growth",
    "max_scopes_active": 3,
    "max_sessions_month": 1500,
    "max_integrations_per_agent": null,
    "max_active_agents_per_scope": 1,
    "workflows_unlimited": true,
    "integrations_unlimited": true
  }'::jsonb
WHERE name = 'growth';

INSERT INTO plans (
  name,
  max_agents,
  max_users,
  max_messages_month,
  price_monthly_usd,
  features,
  is_active
)
SELECT
  'scale',
  24,
  10,
  100000,
  249.00,
  '{
    "audit_logs_retention_days": 180,
    "allowed_channels": ["web", "email", "whatsapp"],
    "allowed_llm_providers": ["openai", "anthropic", "gemini"],
    "api_access": true,
    "webhooks_enabled": true,
    "agent_versioning": true,
    "max_webhook_endpoints": 10,
    "public_label": "Scale",
    "max_scopes_active": 6,
    "max_sessions_month": 5000,
    "max_integrations_per_agent": null,
    "max_active_agents_per_scope": 1,
    "workflows_unlimited": true,
    "integrations_unlimited": true
  }'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM plans
  WHERE name = 'scale'
);

UPDATE plans
SET
  price_monthly_usd = NULL,
  features = COALESCE(features, '{}'::jsonb) || '{
    "public_label": "Enterprise",
    "max_scopes_active": null,
    "max_sessions_month": null,
    "max_integrations_per_agent": null,
    "max_active_agents_per_scope": null,
    "workflows_unlimited": true,
    "integrations_unlimited": true
  }'::jsonb
WHERE name = 'enterprise';
