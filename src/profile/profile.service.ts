import { Injectable } from "@nestjs/common";
import { User } from "better-auth";

import { IDatabaseService } from "@/src/database/database.service";
import type {
  TDatabase,
  TProfile,
  TProfilePopulated,
} from "@/src/database/database.types";

import type {
  EducationDto,
  UpdateJobPreferenceDto,
  UpdateProfileDto,
  ProfileLinksDto,
  UpdateWorkExperienceDto,
  WorkOverviewDto,
} from "./profile.dto";

@Injectable()
export class ProfileService {
  public constructor(private readonly db: IDatabaseService) {}

  public async findProfile(user?: User): Promise<TProfilePopulated> {
    const userId = user?.id;
    const name = user?.name;

    const [profile] = (await this.db.findAllByColumn("profiles", {
      filter: userId ? { id: userId } : {},
      relation: {
        links: true,
        workOverviews: { with: { skills: true, industries: true } },
        workExperiences: true,
        educations: true,
        jobPreferences: { with: { titles: true } },
      },
    })) as unknown as [TProfilePopulated | undefined];

    if (!profile) {
      const profile = await this.db.create("profiles", {
        id: userId ?? crypto.randomUUID(),
        firstName: name ?? "",
      });

      return {
        links: [],
        workOverviews: [],
        workExperiences: [],
        educations: [],
        jobPreferences: [],
        ...profile,
      };
    }

    return profile;
  }

  public async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<TProfile> {
    const [profile] = await this.db.update("profiles", dto, { id: userId });
    return profile;
  }

  public async updateWorkOverview(
    userId: string,
    dto: WorkOverviewDto,
  ): Promise<void> {
    const { skills, industries, ...overviewFields } = dto;

    await this.db.withTransaction(async (transaction) => {
      // for now allows only one section per userId
      const existing = await this.db.findAllByColumn("work_overview", {
        filter: { profileId: userId },
      });
      const overviewId = existing[0]?.id;

      if (overviewId) {
        if (Object.keys(overviewFields).length > 0) {
          await this.db.update(
            "work_overview",
            overviewFields,
            { id: overviewId },
            transaction,
          );
        }

        if (Array.isArray(skills) || Array.isArray(industries)) {
          await this._replaceWorkOverviewRelations(
            overviewId,
            transaction,
            skills,
            industries,
          );
        }
      } else {
        const created = (await this.db.create(
          "work_overview",
          { profileId: userId, ...overviewFields },
          transaction,
        )) as unknown as { id: number };

        if (Array.isArray(skills) || Array.isArray(industries)) {
          await this._replaceWorkOverviewRelations(
            created.id,
            transaction,
            skills,
            industries,
          );
        }
      }
    });
  }

  public async updateWorkExperience(
    userId: string,
    dto: UpdateWorkExperienceDto,
  ): Promise<void> {
    await this.db.withTransaction(async (transaction) => {
      await this.db.syncOneToMany(
        "work_experience",
        { column: "profileId", value: userId },
        dto.experiences,
        transaction,
      );
    });
  }

  public async updateEducation(
    userId: string,
    dto: EducationDto,
  ): Promise<void> {
    await this.db.withTransaction(async (transaction) => {
      await this.db.syncOneToMany(
        "education",
        { column: "profileId", value: userId },
        dto.education,
        transaction,
      );
    });
  }

  public async updatePreferences(
    userId: string,
    dto: UpdateJobPreferenceDto,
  ): Promise<void> {
    const { titles, ...prefFields } = dto;

    await this.db.withTransaction(async (transaction) => {
      const existing = (await this.db.findAllByColumn("job_preference", {
        filter: { profileId: userId },
      })) as unknown as { id: string }[];

      const preferenceId = existing[0]?.id;

      if (preferenceId) {
        if (Object.keys(prefFields).length > 0) {
          await this.db.update(
            "job_preference",
            prefFields,
            { id: preferenceId },
            transaction,
          );
        }

        if (Array.isArray(titles)) {
          await this.db.syncJunctionTable(
            "preference_titles",
            { column: "preferenceId", value: preferenceId },
            "roleId",
            titles,
            transaction,
          );
        }
      } else {
        if (Object.keys(prefFields).length > 0) {
          const created = (await this.db.create(
            "job_preference",
            { profileId: userId, ...prefFields },
            transaction,
          )) as unknown as { id: string };

          if (Array.isArray(titles)) {
            await this.db.syncJunctionTable(
              "preference_titles",
              { column: "preferenceId", value: created.id },
              "roleId",
              titles,
              transaction,
            );
          }
          return;
        }
      }
    });
  }

  public async updateLinks(
    userId: string,
    dto: ProfileLinksDto,
  ): Promise<void> {
    const links = dto.links;

    await this.db.withTransaction(async (transaction) => {
      await this.db.delete(
        "profile_links",
        { profileId: userId },
        true,
        transaction,
      );

      if (links.length > 0) {
        const linkData = links.map((link) => ({
          profileId: userId,
          ...link,
        }));
        await this.db.createMany("profile_links", linkData, transaction);
      }
    });
  }

  private async _replaceWorkOverviewRelations(
    workId: number,
    transaction: TDatabase,
    skills?: number[] | null,
    industries?: number[] | null,
  ): Promise<void> {
    if (Array.isArray(skills)) {
      await this.db.syncJunctionTable(
        "work_skills",
        { column: "workId", value: workId },
        "topicId",
        skills,
        transaction,
      );
    }

    if (Array.isArray(industries)) {
      await this.db.syncJunctionTable(
        "work_industries",
        { column: "workId", value: workId },
        "industryId",
        industries,
        transaction,
      );
    }
  }
}
