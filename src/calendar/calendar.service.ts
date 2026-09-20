import { BadRequestException, Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
import type { TCalendarEvent } from "@/src/database/database.types";

import { CreateCalendarEventDto, UpdateCalendarEventDto } from "./calendar.dto";

@Injectable()
export class CalendarService {
  constructor(private readonly db: IDatabaseService) {}

  async findAll(userId?: string): Promise<TCalendarEvent[]> {
    return this.db.findAllByColumn("calendar_events", {
      filter: userId ? { userId: userId as never } : {},
      sortBy: [{ column: "startDate", order: "asc" }],
    });
  }

  async create(
    dto: CreateCalendarEventDto,
    userId?: string,
  ): Promise<TCalendarEvent> {
    return this.db.create(
      "calendar_events",
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      { ...dto, userId },
    );
  }

  async update(
    id: string,
    dto: UpdateCalendarEventDto,
    userId?: string,
  ): Promise<TCalendarEvent> {
    const existing = await this.db.findById("calendar_events" as never, id, {
      filter: userId ? { userId: userId as never } : {},
    });

    const effectiveStart = dto.startDate ?? existing.startDate;
    const effectiveEnd = dto.endDate ?? existing.endDate;
    if (effectiveEnd.getTime() <= effectiveStart.getTime()) {
      throw new BadRequestException("endDate must be after startDate");
    }

    const [updated] = await this.db.update("calendar_events", dto, {
      id,
      ...(userId ? { userId } : {}),
    });

    return updated;
  }

  async remove(id: string, userId?: string): Promise<void> {
    return this.db.delete("calendar_events", {
      id,
      ...(userId ? { userId: userId } : {}),
    });
  }
}
