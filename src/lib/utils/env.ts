const isServer = typeof window === "undefined";

const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function requireServerEnv(key: string): string {
  if (!isServer) {
    throw new Error(
      `La variable de entorno "${key}" solo puede accederse desde el servidor. ` +
        `No la uses en componentes cliente ni en codigo que se ejecute en el browser.`
    );
  }

  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Variable de entorno requerida no definida: "${key}". ` +
        `Asegurate de definirla en .env.local antes de iniciar el servidor.`
    );
  }

  return value;
}

function requirePublicEnv(value: string | undefined, key: string): string {
  if (value) {
    return value;
  }

  throw new Error(
    `Variable de entorno publica requerida no definida: "${key}". ` +
      `Asegurate de definirla en .env.local con el prefijo NEXT_PUBLIC_.`
  );
}

function getOptionalServerEnv(key: string, fallback: string): string {
  if (!isServer) {
    throw new Error(
      `La variable de entorno "${key}" solo puede accederse desde el servidor. ` +
        `No la uses en componentes cliente ni en codigo que se ejecute en el browser.`
    );
  }

  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function getOptionalServerBooleanEnv(key: string, fallback: boolean): boolean {
  const value = getOptionalServerEnv(key, fallback ? "true" : "false").toLowerCase();
  return value !== "false" && value !== "0" && value !== "no" && value !== "off";
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: requirePublicEnv(
    publicSupabaseUrl,
    "NEXT_PUBLIC_SUPABASE_URL"
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requirePublicEnv(
    publicSupabaseAnonKey,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  ),

  get SUPABASE_SERVICE_ROLE_KEY() {
    return requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  },

  get APP_BASE_URL() {
    return requireServerEnv("APP_BASE_URL");
  },

  get INTEGRATION_SECRETS_ENCRYPTION_KEY() {
    return requireServerEnv("INTEGRATION_SECRETS_ENCRYPTION_KEY");
  },

  get LITELLM_BASE_URL() {
    return requireServerEnv("LITELLM_BASE_URL");
  },

  get LITELLM_API_KEY() {
    return requireServerEnv("LITELLM_API_KEY");
  },

  get REDIS_URL() {
    return requireServerEnv("REDIS_URL");
  },

  get OPENAI_API_KEY() {
    return requireServerEnv("OPENAI_API_KEY");
  },

  get CRON_SECRET() {
    return requireServerEnv("CRON_SECRET");
  },

  get WORKERS_ENABLED() {
    return getOptionalServerBooleanEnv("WORKERS_ENABLED", true);
  },

  get SALESFORCE_CLIENT_ID() {
    return requireServerEnv("SALESFORCE_CLIENT_ID");
  },

  get SALESFORCE_CLIENT_SECRET() {
    return requireServerEnv("SALESFORCE_CLIENT_SECRET");
  },

  get SALESFORCE_LOGIN_URL() {
    return getOptionalServerEnv("SALESFORCE_LOGIN_URL", "https://login.salesforce.com");
  },

  get SALESFORCE_OAUTH_SCOPES() {
    return getOptionalServerEnv("SALESFORCE_OAUTH_SCOPES", "api refresh_token");
  },

  get SALESFORCE_API_VERSION() {
    return getOptionalServerEnv("SALESFORCE_API_VERSION", "v61.0");
  },

  get GOOGLE_CLIENT_ID() {
    return requireServerEnv("GOOGLE_CLIENT_ID");
  },

  get GOOGLE_CLIENT_SECRET() {
    return requireServerEnv("GOOGLE_CLIENT_SECRET");
  },

  get N8N_BASE_URL() {
    return requireServerEnv("N8N_BASE_URL");
  },

  get N8N_API_KEY() {
    return requireServerEnv("N8N_API_KEY");
  },

  get LLM_ROUTER_ENABLED() {
    return getOptionalServerBooleanEnv("LLM_ROUTER_ENABLED", true);
  },

  get LLM_ROUTER_ROLLOUT_PERCENT() {
    return getOptionalServerEnv("LLM_ROUTER_ROLLOUT_PERCENT", "100");
  },

  get LLM_ROUTER_ORG_IDS() {
    return getOptionalServerEnv("LLM_ROUTER_ORG_IDS", "");
  },

  get LITELLM_ROUTER_CHEAP_MODEL() {
    return getOptionalServerEnv("LITELLM_ROUTER_CHEAP_MODEL", "gpt-4o-mini");
  },

  get LITELLM_ROUTER_STRONG_MODEL() {
    return getOptionalServerEnv("LITELLM_ROUTER_STRONG_MODEL", "gpt-4o");
  },

  get AGENT_COMPACT_PROMPT_ENABLED() {
    return getOptionalServerBooleanEnv("AGENT_COMPACT_PROMPT_ENABLED", false);
  },

  get AGENT_COMPACT_PROMPT_ORG_IDS() {
    return getOptionalServerEnv("AGENT_COMPACT_PROMPT_ORG_IDS", "");
  },

} as const;
