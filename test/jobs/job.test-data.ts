/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-unsafe-return */
import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

import { statusEnum } from "@/src/database/postgres/schemas";
import type { CreateJobDto } from "@/src/jobs/jobs.dto";

import {
  expectEnum,
  expectNullableNumber,
  expectNullableString,
} from "../utils/data-helpers";

export const getJobPayload = (data?: Partial<CreateJobDto>): CreateJobDto => ({
  title: faker.string.alphanumeric(10),
  companyName: faker.company.name(),
  description: faker.string.sample(15),
  status: "saved",
  isFavorite: false,
  ...data,
});

export const expectedJobStructure = () =>
  expect.objectContaining({
    title: expect.any(String),
    companyName: expect.any(String),
    description: expect.any(String),
    provider: expect.any(String),
    state: "ok",
    url: expectNullableString,
    roleId: expectNullableNumber,
    deadline: expectNullableString,
    location: expectNullableString,
    links: expectNullableString,
    track: expect.objectContaining({
      status: expectEnum(statusEnum.enumValues),
      isFavorite: expect.any(Boolean),
      notes: expectNullableString,
      interviewDate: expectNullableString,
      appliedAt: expectNullableString,
    }),
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });
