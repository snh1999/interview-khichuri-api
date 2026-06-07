export interface THealthReturn {
  status: string;
  message: string;
  timestamp: string;
  checks: { database: TDatabaseCheck };
}

export interface TDatabaseCheck {
  status: "up" | "down";
  responseTimeMs?: number;
  error?: unknown;
}
