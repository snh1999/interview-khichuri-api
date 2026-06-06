import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Query,
} from "@nestjs/common";
import { Roles } from "@thallesp/nestjs-better-auth";

import { TTopics } from "@/src/database/database.types";
import { CreateLookupDto, UpdateLookupDto } from "@/src/lookups/lookups.dto";

import { TopicsService } from "./topics.service";

@Controller("topics")
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Post()
  createTopic(@Body() createTopicDto: CreateLookupDto): Promise<TTopics> {
    return this.topicsService.createTopic(createTopicDto);
  }

  @Get()
  findAllTopics(@Query("name") name?: string): Promise<TTopics[]> {
    return this.topicsService.findAll(name);
  }

  @Patch(":id")
  @Roles(["admin"])
  updateTopic(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateTopicDto: UpdateLookupDto,
  ): Promise<TTopics> {
    return this.topicsService.updateTopic(id, updateTopicDto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(["admin"])
  deleteTopic(@Param("id", ParseIntPipe) id: number): Promise<void> {
    return this.topicsService.deleteTopic(id);
  }
}
