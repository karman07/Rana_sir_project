export interface Env {
  NODE_ENV: string;
  PORT: number;
  WEB_ORIGIN: string;
  MONGODB_URI: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM: string;
  UPLOAD_DIR: string;
  RESEND_WEBHOOK_SECRET?: string;
  EMAIL_WORKER: 'on' | 'off';
  GOOGLE_CLIENT_ID?: string;
  /** Path to a Firebase service-account JSON (or put the JSON itself in FIREBASE_SERVICE_ACCOUNT_JSON). Enables Google sign-in via Firebase. */
  FIREBASE_SERVICE_ACCOUNT_PATH?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  /** When true, password accounts must confirm their email before they can sign in. */
  REQUIRE_EMAIL_VERIFICATION: boolean;
  COOKIE_DOMAIN?: string;
  ACCESS_TOKEN_TTL_MIN: number;
  REFRESH_TOKEN_TTL_DAYS: number;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const str = (k: string, d?: string): string => {
    const v = (raw[k] as string | undefined) ?? d;
    if (v === undefined || v === '') throw new Error(`Missing required env var ${k}`);
    return v;
  };
  const nodeEnv = str('NODE_ENV', 'development');
  const prod = nodeEnv === 'production';
  const secret = (k: string) => (prod ? str(k) : str(k, `dev-only-${k.toLowerCase()}`));
  return {
    // Keep unrelated vars (e.g. ADMIN_* for scripts) available on process.env.
    ...(raw as Record<string, string>),
    NODE_ENV: nodeEnv,
    PORT: Number(str('PORT', '4100')),
    WEB_ORIGIN: str('WEB_ORIGIN', 'http://localhost:3000'),
    MONGODB_URI: str('MONGODB_URI', 'mongodb://127.0.0.1:27017/recruitment'),
    JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),
    RESEND_API_KEY: (raw.RESEND_API_KEY as string) || undefined,
    EMAIL_FROM: str('EMAIL_FROM', 'Recruitment <onboarding@resend.dev>'),
    UPLOAD_DIR: str('UPLOAD_DIR', './storage/private'),
    RESEND_WEBHOOK_SECRET: (raw.RESEND_WEBHOOK_SECRET as string) || undefined,
    EMAIL_WORKER: (raw.EMAIL_WORKER as string) === 'off' ? 'off' : 'on',
    GOOGLE_CLIENT_ID: (raw.GOOGLE_CLIENT_ID as string) || undefined,
    FIREBASE_SERVICE_ACCOUNT_PATH: (raw.FIREBASE_SERVICE_ACCOUNT_PATH as string) || undefined,
    FIREBASE_SERVICE_ACCOUNT_JSON: (raw.FIREBASE_SERVICE_ACCOUNT_JSON as string) || undefined,
    REQUIRE_EMAIL_VERIFICATION: (raw.REQUIRE_EMAIL_VERIFICATION as string) !== 'false',
    COOKIE_DOMAIN: (raw.COOKIE_DOMAIN as string) || undefined,
    ACCESS_TOKEN_TTL_MIN: Number(str('ACCESS_TOKEN_TTL_MIN', '15')),
    REFRESH_TOKEN_TTL_DAYS: Number(str('REFRESH_TOKEN_TTL_DAYS', '7')),
  };
}
