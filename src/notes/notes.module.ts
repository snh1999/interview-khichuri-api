import { Module } from "@nestjs/common";

import { GenAiModule } from "@/src/gen-ai/gen-ai.module";

import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";

@Module({
  imports: [GenAiModule],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
