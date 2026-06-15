import { z } from "zod";

export const basicSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test", "local"]),
  DATABASE_URL: z.url(),
  FRONTEND_URL: z.url(),
});

export const envSchema = basicSchema.extend({
  BETTER_AUTH_SECRET: z.string().length(32),
  GITHUB_CLIENT_ID: z.string().length(20),
  GITHUB_CLIENT_SECRET: z.string().length(40),
  GOOGLE_CLIENT_ID: z
    .string()
    .length(72)
    .endsWith(".apps.googleusercontent.com"),
  GOOGLE_CLIENT_SECRET: z.string().length(35),
  GITLAB_CLIENT_ID: z.string().length(64),
  GITLAB_CLIENT_SECRET: z.string().length(70),
  RESEND_API_KEY: z.string().length(36),
  RESEND_FROM_EMAIL: z.email(),

  R2_BUCKET_NAME: z.string(),
  R2_ENDPOINT: z.url().length(65).endsWith(".r2.cloudflarestorage.com"),
  R2_ACCESS_KEY: z.string().length(32),
  R2_SECRET_KEY: z.string().length(64),

  ENCRYPTION_KEY: z.string().length(64),
});

export type TBasicSchema = z.infer<typeof basicSchema>;
export type TEnvSchema = z.infer<typeof envSchema>;
