/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-unsafe-return */
import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

import type { TPrepSession, TQuestion } from "@/src/database/database.types";
import type { CreateQuestionDto } from "@/src/prep-session/dto/question.dto";
import type { CreatePrepSessionDto } from "@/src/prep-session/dto/session.dto";

import {
  expectNullableNumber,
  expectNullableString,
} from "../utils/data-helpers";

export const getPrepSessionPayload = (
  data?: Partial<TPrepSession>,
): CreatePrepSessionDto => {
  const { isFavorite, title, description, ...rest } = data ?? {};
  return {
    ...rest,
    title: title ?? faker.string.sample(10),
    description: description ?? faker.string.sample(15),
    isFavorite: isFavorite ?? false,
  };
};

export const expectedPrepSessionStructure = () =>
  expect.objectContaining({
    title: expect.any(String),
    description: expect.any(String),
    experience: expectNullableString,
    isFavorite: expect.any(Boolean),
    jobId: expectNullableString,
    roleId: expectNullableNumber,
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });

export const getQuestionPayload = (
  data?: Partial<TQuestion>,
): CreateQuestionDto => ({
  questionText: faker.string.sample(),
  ...data,
});
