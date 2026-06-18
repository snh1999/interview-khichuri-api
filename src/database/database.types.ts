import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type {
  TdbPostgres,
  TpgCols,
  TpgTableKey,
  TpgTableRegistry,
  TpgWithRelations,
} from "@/src/database/postgres/postgres.service";
import type {
  companies,
  education,
  industries,
  job_preference,
  jobs,
  preference_titles,
  prep_session,
  profile_links,
  profiles,
  questions,
  resume,
  roles,
  api_key,
  topics,
  work_experience,
  work_industries,
  work_overview,
  work_skills,
} from "@/src/database/postgres/schemas";
import type {
  TdbSqlite,
  TSqliteCols,
  TsqliteTableRegistry,
  TsqliteWithRelations,
} from "@/src/database/sqlite/sqlite.service";

export type TReturn<T> = Promise<T> | T;
export type TDatabase = TdbPostgres | TdbSqlite;

export type TdbWithRelations<K extends TpgTableKey> =
  | TsqliteWithRelations<K>
  | TpgWithRelations<K>;

// postgres schema get precedence over sqlite for extra FK userId (optional),
export type TJob = InferSelectModel<typeof jobs>;
export type TJobInsert = InferInsertModel<typeof jobs>;

export type TRole = InferSelectModel<typeof roles>;
export type TRoleInsert = InferInsertModel<typeof roles>;

export type TTopics = InferSelectModel<typeof topics>;
export type TTopicsInsert = InferInsertModel<typeof topics>;

export type TPrepSession = InferSelectModel<typeof prep_session>;
export type TPrepSessionInsert = InferInsertModel<typeof prep_session>;
export type TQuestion = InferSelectModel<typeof questions>;
export type TQuestionInsert = InferInsertModel<typeof questions>;

export type TApiKeyInsecure = InferSelectModel<typeof api_key>;
export type TApiKeyInsert = InferInsertModel<typeof api_key>;
export type TApiKeyPlatform = TApiKeyInsecure["platform"];
export type TApiKey = Omit<TApiKeyInsecure, "key">;

export type TPrepSessionWithQuestions = InferSelectModel<
  typeof prep_session
> & {
  questions: TQuestion[];
};

export type TProfile = InferSelectModel<typeof profiles>;
export type TProfileInsert = InferInsertModel<typeof profiles>;

export type TProfileLink = InferSelectModel<typeof profile_links>;
export type TProfileLinkInsert = InferInsertModel<typeof profile_links>;

export type TWorkOverview = InferSelectModel<typeof work_overview>;
export type TWorkOverviewInsert = InferInsertModel<typeof work_overview>;

export type TWorkSkill = InferSelectModel<typeof work_skills>;
export type TWorkSkillInsert = InferInsertModel<typeof work_skills>;

export type TIndustry = InferSelectModel<typeof industries>;
export type TIndustryInsert = InferInsertModel<typeof industries>;

export type TWorkIndustry = InferSelectModel<typeof work_industries>;
export type TWorkIndustryInsert = InferInsertModel<typeof work_industries>;

export type TWorkExperience = InferSelectModel<typeof work_experience>;
export type TWorkExperienceInsert = InferInsertModel<typeof work_experience>;

export type TEducation = InferSelectModel<typeof education>;
export type TEducationInsert = InferInsertModel<typeof education>;

export type TJobPreference = InferSelectModel<typeof job_preference>;
export type TJobPreferenceInsert = InferInsertModel<typeof job_preference>;

export type TPreferenceTitle = InferSelectModel<typeof preference_titles>;
export type TPreferenceTitleInsert = InferInsertModel<typeof preference_titles>;

export type TResume = InferSelectModel<typeof resume>;
export type TResumeInsert = InferInsertModel<typeof resume>;

export type TCompany = InferSelectModel<typeof companies>;
export type TCompanyInsert = InferInsertModel<typeof companies>;

export type TProfilePopulated = TProfile & {
  links: TProfileLink[];
  workOverviews: TWorkOverview[];
  workExperiences: TWorkExperience[];
  educations: TEducation[];
  resumes: TResume[];
  jobPreferences: TJobPreference[];
};

interface TJobTopicRelation {
  id: number;
  jobId: string;
  topicId: number;
  topic: InferSelectModel<typeof topics>;
}

export type TJobWithTopics = InferSelectModel<typeof jobs> & {
  jobTopics: TJobTopicRelation[];
};

export interface TPagination {
  limit: number;
  offset: number;
}

export type TInsert<K extends TpgTableKey> =
  | InferInsertModel<TpgTableRegistry[K]>
  | InferInsertModel<TsqliteTableRegistry[K]>;

export type TSelect<K extends TpgTableKey> =
  | InferSelectModel<TpgTableRegistry[K]>
  | InferSelectModel<TsqliteTableRegistry[K]>;

export interface TSearchResult<K extends TpgTableKey> {
  data: TSelect<K>[];
  total?: number;
}

export type TColumnNames<K extends TpgTableKey> = TpgCols<K> | TSqliteCols<K>;

type TColumnValue<K extends TpgTableKey, C extends TColumnNames<K>> =
  | (C extends keyof InferSelectModel<TpgTableRegistry[K]>
      ? InferSelectModel<TpgTableRegistry[K]>[C]
      : never)
  | (C extends keyof InferSelectModel<TsqliteTableRegistry[K]>
      ? InferSelectModel<TsqliteTableRegistry[K]>[C]
      : never);

export type TSingleColumnFilter<K extends TpgTableKey> = {
  [C in TColumnNames<K>]: {
    columnName: C;
    value: TColumnValue<K, C> | TColumnValue<K, C>[];
  };
}[TColumnNames<K>];

export type TSchemaColumnFilter<T extends AnyPgTable | SQLiteTable> = {
  [C in keyof T["_"]["columns"]]?:
    | InferSelectModel<T>[C & keyof InferSelectModel<T>]
    | InferSelectModel<T>[C & keyof InferSelectModel<T>][];
};

// No clear path to derive from TSchemaColumnFilter as we need both pg and sqlite registry
export type TColumnFilter<K extends TpgTableKey> = {
  [C in TColumnNames<K>]?: TColumnValue<K, C> | TColumnValue<K, C>[];
};

export type TSortOrder = "asc" | "desc";

export interface TSortBy<K extends TpgTableKey> {
  columnName: TColumnNames<K>;
  order?: TSortOrder;
}
