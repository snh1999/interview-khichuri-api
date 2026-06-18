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
  UpdateEducationDto,
  UpdateJobPreferenceDto,
  UpdateProfileDto,
  UpdateProfileLinksDto,
  UpdateWorkExperienceDto,
  UpdateWorkOverviewDto,
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
    @Body() dto: UpdateWorkOverviewDto,
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
    @Body() dto: UpdateEducationDto,
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
    @Body() dto: UpdateProfileLinksDto,
    @UserId() userId?: string,
  ): Promise<void> {
    await this.profileService.updateLinks(userId ?? "app", dto);
  }
}
