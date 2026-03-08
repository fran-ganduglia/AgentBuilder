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
} as const;
