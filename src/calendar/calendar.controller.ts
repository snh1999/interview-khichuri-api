import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";

import { UserId } from "@/src/config/guards/user-id.decorator";
import type { TCalendarEvent } from "@/src/database/database.types";

import { CreateCalendarEventDto, UpdateCalendarEventDto } from "./calendar.dto";
import { CalendarService } from "./calendar.service";

@Controller("calendar/events")
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  findAll(@UserId() userId?: string): Promise<TCalendarEvent[]> {
    return this.calendarService.findAll(userId);
  }

  @Post()
  create(
    @Body() dto: CreateCalendarEventDto,
    @UserId() userId?: string,
  ): Promise<TCalendarEvent> {
    return this.calendarService.create(dto, userId);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCalendarEventDto,
    @UserId() userId?: string,
  ): Promise<TCalendarEvent> {
    return this.calendarService.update(id, dto, userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @UserId() userId?: string,
  ): Promise<void> {
    return this.calendarService.remove(id, userId);
  }
}
