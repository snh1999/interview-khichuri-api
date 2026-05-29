import { z } from "zod";
import type { ConfigService } from "@nestjs/config";

export const basicSchema = z.object({
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
});

type TEnv = z.infer<typeof envSchema>;

export type AppConfig = ConfigService<TEnv, true>;
