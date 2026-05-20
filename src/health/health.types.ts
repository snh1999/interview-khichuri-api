export type THealthReturn = {
  status: string;
  message: string;
  timestamp: string;
  checks: { database: TDatabaseCheck };
};

export type TDatabaseCheck = {
  status: "up" | "down";
  responseTimeMs?: number;
  error?: unknown;
};
