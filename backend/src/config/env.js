import { config } from "dotenv";
import { z } from "zod";

config();

// Bypass broken proxy envs.
for (const key of [
  "HTTP_PROXY",
  "http_proxy",
  "HTTPS_PROXY",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy"
]) {
  delete process.env[key];
}

const noProxyEntries = new Set(
  String(process.env.NO_PROXY || process.env.no_proxy || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
);
for (const localHost of ["localhost", "127.0.0.1", "::1"]) {
  noProxyEntries.add(localHost);
}
const noProxyValue = Array.from(noProxyEntries).join(",");
process.env.NO_PROXY = noProxyValue;
process.env.no_proxy = noProxyValue;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),

  JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(16).default("dev-refresh-secret-change-me"),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),

  GOOGLE_CLIENT_ID: z.string().optional(),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default("user-uploads"),

  DATABASE_URL: z.string().optional(),

  QDRANT_URL: z.string().url().optional(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION_MODE: z.enum(["per-workspace", "global"]).default("per-workspace"),

  REDIS_URL: z.string().optional(),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  CEREBRAS_API_KEY: z.string().optional(),
  CEREBRAS_MODEL: z.string().default("zai-glm-4.7"),

  KAGGLE_INTEGRATION_MODE: z.enum(["per-user-token", "server-token"]).default("per-user-token"),
  KAGGLE_API_TOKEN: z.string().optional(),
  KAGGLE_USERNAME: z.string().optional(),

  AI_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(50)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid backend environment configuration");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("backend env validation failed");
}

export const env = parsed.data;
