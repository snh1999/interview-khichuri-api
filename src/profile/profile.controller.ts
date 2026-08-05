import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
} from "@nestjs/common";
import type { User } from "better-auth";

import { GetUser, UserId } from "@/src/config/guards/user-id.decorator";
import {
  type TProfile,
  TProfilePopulated,
} from "@/src/database/database.types";

import {
  ActivitiesDto,
  EducationDto,
  PublicationsDto,
  ReferencesDto,
  ProjectsDto,
  UpdateJobPreferenceDto,
  UpdateProfileDto,
  ProfileLinksDto,
  UpdateWorkExperienceDto,
  WorkOverviewDto,
} from "./profile.dto";
import { ProfileService } from "./profile.service";

@Controller("profile")
export class ProfileController {
  public constructor(private readonly profileService: ProfileService) {}

  @Get()
  public find(@GetUser() user?: User): Promise<TProfilePopulated> {
    return this.profileService.findProfile(user);
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  public async updateProfile(
    @Body() dto: UpdateProfileDto,
    @UserId() userId?: string,
  ): Promise<TProfile> {
    return this.profileService.updateProfile(userId ?? "app", dto);
  }

  @Put("work-overview")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async updateWorkOverview(
    @Body() dto: WorkOverviewDto,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.profileService.updateWorkOverview(userId ?? "app", dto);
  }

  @Put("work-experience")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async updateWorkExperience(
    @Body() dto: UpdateWorkExperienceDto,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.profileService.updateWorkExperience(userId ?? "app", dto);
  }

  @Put("education")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async updateEducation(
    @Body() dto: EducationDto,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.profileService.updateEducation(userId ?? "app", dto);
  }

  @Put("preferences")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async updatePreferences(
    @Body() dto: UpdateJobPreferenceDto,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.profileService.updatePreferences(userId ?? "app", dto);
  }

  @Put("links")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async updateLinks(
    @Body() dto: ProfileLinksDto,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.profileService.updateLinks(userId ?? "app", dto);
  }

  @Put("publications")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async updatePublications(
    @Body() dto: PublicationsDto,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.profileService.updatePublications(userId ?? "app", dto);
  }

  @Put("projects")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async updateProjects(
    @Body() dto: ProjectsDto,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.profileService.updateProjects(userId ?? "app", dto);
  }

  @Put("references")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async updateReferences(
    @Body() dto: ReferencesDto,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.profileService.updateReferences(userId ?? "app", dto);
  }

  @Put("activities")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async updateActivities(
    @Body() dto: ActivitiesDto,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.profileService.updateActivities(userId ?? "app", dto);
  }
}
