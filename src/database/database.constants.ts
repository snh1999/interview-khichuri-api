export const RAW_DATABASE_CLIENT = Symbol("RAW_DATABASE_CLIENT");
export const DATABASE_CONNECTION = Symbol("DATABASE_CONNECTION");

export const COMPANY_PROVIDERS = [
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "scrape",
] as const;
export const JOB_PROVIDERS = [...COMPANY_PROVIDERS, "manual"] as const;
export const JOB_STATUS = [
  "applied",
  "saved",
  "scheduled",
  "interviewed",
  "offer",
  "rejected",
  "not_selected",
  "withdrawn",
] as const;
export const JOB_STATES = ["none", "ok", "failed"] as const;
