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
  activities,
  calendar_events,
  categories,
  companies,
  education,
  industries,
  interviews,
  job_preference,
  jobs,
  notes,
  preference_titles,
  prep_session,
  profile_links,
  profiles,
  prompt_likes,
  prompts,
  publications,
  projects,
  project_skills,
  questions,
  references,
  resume,
  roles,
  api_key,
  topics,
  user_default_prompts,
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
  TsqliteWithRelations<K> | TpgWithRelations<K>;

// postgres schema get precedence over sqlite for extra FK userId (optional),
export type TJob = InferSelectModel<typeof jobs>;
export type TJobInsert = InferInsertModel<typeof jobs>;
export type TJobWithCompany = TJob & { company?: TCompany };

export type TRole = InferSelectModel<typeof roles>;
export type TRoleInsert = InferInsertModel<typeof roles>;

export type TTopics = InferSelectModel<typeof topics>;
export type TTopicsInsert = InferInsertModel<typeof topics>;

export type TPrepSession = InferSelectModel<typeof prep_session>;
export type TPrepSessionInsert = InferInsertModel<typeof prep_session>;
export type TQuestion = InferSelectModel<typeof questions>;
export type TQuestionInsert = InferInsertModel<typeof questions>;

export type TNote = InferSelectModel<typeof notes>;
export type TNoteInsert = InferInsertModel<typeof notes>;
export type TNoteWithJobTitle = TNote & { jobTitle?: string };

export type TInterview = InferSelectModel<typeof interviews>;
export type TInterviewInsert = InferInsertModel<typeof interviews>;

export type TApiKeyInsecure = InferSelectModel<typeof api_key>;
export type TApiKeyInsert = InferInsertModel<typeof api_key>;
export type TApiKeyProvider = TApiKeyInsecure["provider"];
export type TApiKey = Omit<TApiKeyInsecure, "key">;

export type TPrepSessionWithQuestions = InferSelectModel<
  typeof prep_session
> & {
  questions: TQuestion[];
  job?: TJob;
  sessionTopics?: { topicId: number }[];
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

export type TPublication = InferSelectModel<typeof publications>;
export type TPublicationInsert = InferInsertModel<typeof publications>;

export type TProfilePublication = Omit<TPublication, "authors"> & {
  authors: string[];
};

export type TProject = InferSelectModel<typeof projects>;
export type TProjectInsert = InferInsertModel<typeof projects>;

export type TProjectSkill = InferSelectModel<typeof project_skills>;
export type TProjectSkillInsert = InferInsertModel<typeof project_skills>;

export type TReference = InferSelectModel<typeof references>;
export type TReferenceInsert = InferInsertModel<typeof references>;

export type TActivity = InferSelectModel<typeof activities>;
export type TActivityInsert = InferInsertModel<typeof activities>;

export type TCategories = InferSelectModel<typeof categories>;
export type TCategoriesInsert = InferInsertModel<typeof categories>;

export type TResume = InferSelectModel<typeof resume>;
export type TResumeInsert = InferInsertModel<typeof resume>;

export type TCompany = InferSelectModel<typeof companies>;
export type TCompanyInsert = InferInsertModel<typeof companies>;

export type TPrompt = InferSelectModel<typeof prompts>;
export type TPromptInsert = InferInsertModel<typeof prompts>;
export type TPromptType = TPrompt["type"];
export type TLikeWithPrompt = InferSelectModel<typeof prompt_likes> & {
  prompt: TPrompt | null;
};
export type TUserDefaultWithPrompt = InferSelectModel<
  typeof user_default_prompts
> & {
  prompt: TPrompt | null;
};

export type TCalendarEvent = InferSelectModel<typeof calendar_events>;
export type TCalendarEventInsert = InferInsertModel<typeof calendar_events>;

export type TProfilePopulated = TProfile & {
  links: TProfileLink[];
  workOverviews: (TWorkOverview & {
    skills: TWorkSkill[];
    industries: TWorkIndustry[];
  })[];
  workExperiences: TWorkExperience[];
  educations: TEducation[];
  jobPreferences: (TJobPreference & { titles: TPreferenceTitle[] })[];
  publications: TProfilePublication[];
  projects: (TProject & {
    skills: (TProjectSkill & { topic: TTopics })[];
  })[];
  references: TReference[];
  activities: TActivity[];
};

interface TJobTopicRelation {
  id: number;
  jobId: string;
  topicId: number;
  topic: InferSelectModel<typeof topics>;
}

export type TJobWithTopics = TJob & {
  jobTopics: TJobTopicRelation[];
  topicIds: number[];
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
  | (Extract<C, keyof InferSelectModel<TpgTableRegistry[K]>> extends never
      ? never
      : InferSelectModel<TpgTableRegistry[K]>[Extract<
          C,
          keyof InferSelectModel<TpgTableRegistry[K]>
        >])
  | (Extract<C, keyof InferSelectModel<TsqliteTableRegistry[K]>> extends never
      ? never
      : InferSelectModel<TsqliteTableRegistry[K]>[Extract<
          C,
          keyof InferSelectModel<TsqliteTableRegistry[K]>
        >]);

export type TSingleColumnFilter<K extends TpgTableKey> = {
  [C in TColumnNames<K>]: {
    column: C;
    value: TColumnValue<K, C> | TColumnValue<K, C>[];
  };
}[TColumnNames<K>];

export type TSchemaColumnFilter<T extends AnyPgTable | SQLiteTable> = {
  [C in keyof T["_"]["columns"]]?:
    | InferSelectModel<T>[Extract<C, keyof InferSelectModel<T>>]
    | InferSelectModel<T>[Extract<C, keyof InferSelectModel<T>>][];
};

// No clear path to derive from TSchemaColumnFilter as we need both pg and sqlite registry
export type TColumnFilter<K extends TpgTableKey> = {
  [C in TColumnNames<K>]?: TColumnValue<K, C> | TColumnValue<K, C>[];
};

export type TSortOrder = "asc" | "desc";

export interface TSortBy<K extends TpgTableKey> {
  column: TColumnNames<K>;
  order?: TSortOrder;
}

export interface IDateRange {
  from?: Date;
  to?: Date;
}

export interface TDateRangeOption<K extends TpgTableKey> {
  column: TColumnNames<K>;
  range: IDateRange;
}

export interface TFindAllByColumnOptions<K extends TpgTableKey> {
  filter?: TColumnFilter<K>;
  sortBy?: TSortBy<K>[];
  pagination?: TPagination;
  relation?: TdbWithRelations<K>;
  dateRanges?: TDateRangeOption<K>[];
}

export interface TFindByIdOptions<K extends TpgTableKey> {
  filter?: TColumnFilter<K>;
  relation?: TdbWithRelations<K>;
}

export interface TSearchOptions<K extends TpgTableKey> {
  filter?: TColumnFilter<K>;
  pagination?: TPagination;
}
