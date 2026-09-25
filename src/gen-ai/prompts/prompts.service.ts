import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { IDatabaseService } from "@/src/database/database.service";
import {
  TPrompt,
  TPromptType,
  TPagination,
  TSortBy,
  TLikeWithPrompt,
  TUserDefaultWithPrompt,
} from "@/src/database/database.types";

import {
  CreatePromptDto,
  SetDefaultPromptDto,
  UpdatePromptDto,
} from "./prompts.dto";
import { PromptValidatorService } from "./validators/prompt-validator.service";

const MAX_USER_PROMPTS = 50;

@Injectable()
export class PromptsService {
  constructor(
    private readonly db: IDatabaseService,
    private readonly promptValidator: PromptValidatorService,
  ) {}

  async create(dto: CreatePromptDto, userId?: string): Promise<TPrompt> {
    this.promptValidator.assertValidOrThrow(dto.prompt, dto.type, dto.title);
    const count = await this.db.count("prompts", userId ? { userId } : {});
    if (count >= MAX_USER_PROMPTS) {
      throw new ConflictException(
        `You can have at most ${MAX_USER_PROMPTS} prompts. Delete some to create more.`,
      );
    }

    return this.db.create("prompts", {
      userId,
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...dto,
    });
  }

  async findAll(
    scope: "public" | "my",
    userId?: string,
    type?: TPromptType,
    search?: string,
    pagination?: TPagination,
  ): Promise<TPrompt[]> {
    const filter = {
      ...(type ? { type } : {}),
      ...(scope === "my"
        ? { ...(userId ? { userId } : {}) }
        : { isPublic: true }),
    };

    if (search) {
      const result = await this.db.search("prompts", ["prompt"], search, {
        filter,
        pagination,
      });
      return result.data;
    }

    return this.db.findAllByColumn("prompts", {
      filter,
      pagination,
      sortBy: [{ column: "createdAt", order: "desc" }] as TSortBy<"prompts">[],
    });
  }

  async findById(id: number): Promise<TPrompt> {
    return this.db.findById("prompts", id);
  }

  async update(
    id: number,
    dto: UpdatePromptDto,
    userId?: string,
  ): Promise<TPrompt> {
    const prompt = await this.db.findById("prompts", id);
    if (userId && prompt.userId !== userId) {
      throw new ForbiddenException("You can only update your own prompts");
    }

    const promptText = dto.prompt ?? prompt.prompt;
    const promptType = dto.type ?? prompt.type;
    this.promptValidator.assertValidOrThrow(promptText, promptType, dto.title);
    const [updated] = await this.db.update("prompts", dto, { id });
    return updated;
  }

  async delete(id: number, userId?: string, isAdmin = false): Promise<void> {
    const prompt = await this.db.findById("prompts", id);
    if (userId && prompt.userId !== userId && !isAdmin) {
      throw new ForbiddenException(
        "You can only delete your own prompts. Admins can delete any.",
      );
    }
    await this.db.delete("prompts", { id });
  }

  async findAllLiked(
    userId?: string,
    type?: TPromptType,
    pagination?: TPagination,
  ): Promise<TPrompt[]> {
    const likes = (await this.db.findAllByColumn("prompt_likes", {
      filter: { userId },
      pagination,
      sortBy: [{ column: "createdAt", order: "desc" }],
      relation: { prompt: true },
    })) as unknown as TLikeWithPrompt[];

    const prompts = likes
      .map((l) => l.prompt)
      .filter((prompt): prompt is TPrompt => prompt !== null);

    if (type) {
      return prompts.filter((prompt) => prompt.type === type);
    }

    return prompts;
  }

  async toggleLike(
    promptId: number,
    userId?: string,
  ): Promise<{ likeCount: number }> {
    if (!userId) {
      throw new BadRequestException(
        "You can not use this feature in App mode.",
      );
    }

    return this.db.withTransaction(async (tx) => {
      await this.db.findById("prompts", promptId);

      const existing = await this.db.findAllByColumn("prompt_likes", {
        filter: { userId, promptId },
      });

      if (existing.length > 0) {
        await this.db.delete("prompt_likes", { userId, promptId }, false, tx);
      } else {
        await this.db.create("prompt_likes", { userId, promptId }, tx);
      }

      const likeCount = await this.db.count("prompt_likes", { promptId }, tx);
      await this.db.update("prompts", { likeCount }, { id: promptId }, tx);

      return { likeCount };
    });
  }

  async getDefaults(userId?: string): Promise<TUserDefaultWithPrompt[]> {
    return (await this.db.findAllByColumn("user_default_prompts", {
      filter: userId ? { userId } : {},
      relation: { prompt: true },
    })) as unknown as TUserDefaultWithPrompt[];
  }

  async setDefault(dto: SetDefaultPromptDto, userId?: string): Promise<void> {
    return this.db.withTransaction(async (tx) => {
      const prompt = await this.db.findById("prompts", dto.promptId);

      if (
        (prompt.userId !== userId && !prompt.isPublic) ||
        prompt.type !== dto.type
      ) {
        throw new ForbiddenException("Operation Not allowed");
      }

      const existing = await this.db.findAllByColumn("user_default_prompts", {
        filter: { userId, type: dto.type },
      });

      if (existing.length > 0) {
        await this.db.update(
          "user_default_prompts",
          { promptId: dto.promptId },
          { userId, type: dto.type },
          tx,
        );
      } else {
        await this.db.create(
          "user_default_prompts",
          { userId, type: dto.type, promptId: dto.promptId },
          tx,
        );
      }
    });
  }
}
