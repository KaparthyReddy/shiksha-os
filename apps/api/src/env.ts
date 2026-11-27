import { z } from "zod";

const DEV_LIVEKIT_SECRET = "secretsecretsecretsecretsecretsecret";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().optional(),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  APP_TIMEZONE: z.string().default("Asia/Kolkata"),
  LIVEKIT_URL: z.string().default("ws://localhost:7880"),
  LIVEKIT_API_KEY: z.string().default("devkey"),
  LIVEKIT_API_SECRET: z.string().min(32).default(DEV_LIVEKIT_SECRET),
});

export const env = schema.parse(process.env);

if (env.NODE_ENV === "production" && env.LIVEKIT_API_SECRET === DEV_LIVEKIT_SECRET) {
  throw new Error("Set LIVEKIT_API_SECRET to your own value in production.");
}
