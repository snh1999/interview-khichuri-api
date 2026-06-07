/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-unsafe-return */
import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

import type { TJob, TJobInsert } from "@/src/database/database.types";
import { statusEnum } from "@/src/database/postgres/schemas";

import {
  expectEnum,
  expectNullableNumber,
  expectNullableString,
} from "../utils/data-helpers";

export const getJobPayload = (data?: Partial<TJob>): TJobInsert => ({
  title: faker.string.alphanumeric(10),
  description: faker.string.sample(15),
  ...data,
});

export const expectedJobStructure = () =>
  expect.objectContaining({
    title: expect.any(String),
    description: expect.any(String),
    status: expectEnum(statusEnum.enumValues),
    roleId: expectNullableNumber,
    deadline: expectNullableString,
    links: expectNullableString,
    notes: expectNullableString,
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });
