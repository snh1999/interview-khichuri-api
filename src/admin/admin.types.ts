import type { TJob } from "@/src/database/database.types";

export interface IAdminStats {
  users: {
    total: number;
    verified: number;
    banned: number;
    new7d: number;
    new30d: number;
    activeSessions: number;
  };
  usage: {
    jobs: number;
    prepSessions: number;
    interviews: number;
    resumes: number;
    notes: number;
    prompts: number;
    apiKeys: number;
    companies: number;
    calendarEvents: number;
  };
  signups: { date: string; count: number }[];
}

export interface IAdminUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IAdminUsersResponse {
  users: IAdminUser[];
  total: number;
}

export interface IAdminJobsResponse {
  items: TJob[];
  total: number;
}

export interface IAdminUserProfile {
  firstName: string;
  lastName: string | null;
  location: string | null;
  country: string | null;
}

export interface IAdminUserCounts {
  jobs: number;
  prepSessions: number;
  interviews: number;
  resumes: number;
  notes: number;
  prompts: number;
  apiKeys: number;
  calendarEvents: number;
}

export interface IAdminUserDetail {
  user: IAdminUser;
  profile: IAdminUserProfile | null;
  counts: IAdminUserCounts;
  providers: string[];
  passkeys: number;
}
