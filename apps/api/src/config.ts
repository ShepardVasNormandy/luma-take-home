import { config as loadEnv } from "dotenv";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadEnv({ path: path.join(repoRoot, ".env.local") });
loadEnv({ path: path.join(repoRoot, "apps/api/.env") });

// All optional at boot; each feature asserts what it needs via requireConfig,
// so /health can run before the full environment exists (T02 smoke).
const schema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().optional(),
  LUMA_AGENTS_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  REVIEW_FROM_EMAIL: z.string().optional(),
  REVIEWER_EMAIL: z.string().optional(),
  BUCKET_ENDPOINT: z.string().optional(),
  BUCKET_NAME: z.string().optional(),
  BUCKET_ACCESS_KEY_ID: z.string().optional(),
  BUCKET_SECRET_ACCESS_KEY: z.string().optional(),
  BUCKET_REGION: z.string().optional(),
  OPERATOR_EMAIL: z.string().optional(),
  OPERATOR_PASSWORD_HASH: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  WEB_URL: z.string().optional(),
  API_PUBLIC_URL: z.string().optional(),
});

export type AppConfig = z.infer<typeof schema>;

export const config: AppConfig = schema.parse(process.env);

export function requireConfig<K extends keyof AppConfig>(key: K): NonNullable<AppConfig[K]> {
  const value = config[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required config: ${String(key)}`);
  }
  return value as NonNullable<AppConfig[K]>;
}
