import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { BaseUserSession } from "@thallesp/nestjs-better-auth";
import type { User as TUser } from "better-auth";
import type { Request } from "express";

interface AuthenticatedRequest extends Request {
  session?: BaseUserSession;
}

export const UserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.session?.user.id;
  },
);

export const GetUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TUser | undefined => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.session?.user;
  },
);
