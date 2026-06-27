import type { TApiKeyProvider } from "@/src/database/database.types";

export const GEN_AI_PROVIDERS = [
  "google",
  "openai",
  "groq",
  "openrouter",
  "mistral",
  "github",
  "cerebras",
] as const;

interface IProviderConfig {
  sdk: "google" | "openai";
  baseURL: string;
  defaultModel: string;
}

export const PROVIDER_CONFIG: Record<TApiKeyProvider, IProviderConfig> = {
  google: {
    sdk: "google",
    baseURL: "",
    defaultModel: "gemini-2.5-flash",
  },
  openai: {
    sdk: "openai",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  groq: {
    sdk: "openai",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
  },
  openrouter: {
    sdk: "openai",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  },
  mistral: {
    sdk: "openai",
    baseURL: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
  },
  github: {
    sdk: "openai",
    baseURL: "https://models.github.ai/inference",
    defaultModel: "openai/gpt-4o-mini",
  },
  cerebras: {
    sdk: "openai",
    baseURL: "https://api.cerebras.ai/v1",
    defaultModel: "llama3.1-8b",
  },
};
