/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

const PROMPT_TYPES = [
  "resume",
  "behavioral",
  "technical",
  "system_design",
  "general",
  "custom",
] as const;

export const getPromptPayload = () => ({
  title: faker.string.alphanumeric(20),
  prompt: faker.lorem.paragraph(),
  type: faker.helpers.arrayElement(PROMPT_TYPES),
  isPublic: faker.datatype.boolean(),
});

export const expectedPromptStructure = () => ({
  id: expect.any(Number),
  userId: expect.any(String),
  title: expect.any(String),
  prompt: expect.any(String),
  type: expect.stringMatching(
    /^(resume|behavioral|technical|system_design|general|custom)$/,
  ),
  isPublic: expect.any(Boolean),
  likeCount: expect.any(Number),
  createdAt: expect.any(String),
  updatedAt: expect.any(String),
});

export const expectedLikeResult = () => ({
  liked: expect.any(Boolean),
  likeCount: expect.any(Number),
});
