import { Injectable } from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
import { TTopics } from "@/src/database/database.types";

import { CreateLookupDto, UpdateLookupDto } from "@/src/lookups/lookups.dto";

@Injectable()
export class TopicsService {
  public constructor(private readonly db: IDatabaseService) {}

  async createTopic(dto: CreateLookupDto): Promise<TTopics> {
    return this.db.create("topics", dto);
  }

  async findAll(name?: string): Promise<TTopics[]> {
    if (name) {
      const result = await this.db.search("topics", ["name"], name);
      return result.data;
    }
    return this.db.findAllByColumn("topics");
  }

  async updateTopic(id: number, dto: UpdateLookupDto): Promise<TTopics> {
    const result = await this.db.update("topics", dto, [
      { columnName: "id", value: id },
    ]);
    return result[0];
  }

  async deleteTopic(id: number): Promise<void> {
    return this.db.delete("topics", [{ columnName: "id", value: id }]);
  }
}
