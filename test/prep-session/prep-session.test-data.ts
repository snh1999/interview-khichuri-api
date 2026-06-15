/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-unsafe-return */
import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

import type {
  TPrepSession,
  TPrepSessionInsert,
  TQuestion,
} from "@/src/database/database.types";

import {
  expectNullableNumber,
  expectNullableString,
} from "../utils/data-helpers";

export const getPrepSessionPayload = (
  data?: Partial<TPrepSession>,
): TPrepSessionInsert => ({
  description: faker.string.sample(15),
  ...data,
});

export const expectedPrepSessionStructure = () =>
  expect.objectContaining({
    description: expect.any(String),
    experience: expectNullableString,
    jobId: expectNullableString,
    roleId: expectNullableNumber,
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });

export const getQuestionPayload = (data?: Partial<TQuestion>) => ({
  questionText: faker.string.sample(),
  ...data,
});
