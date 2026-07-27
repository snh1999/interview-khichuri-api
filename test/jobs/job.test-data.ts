/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-unsafe-return */
import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

import type { TJob } from "@/src/database/database.types";
import { statusEnum } from "@/src/database/postgres/schemas";
import type { CreateJobDto } from "@/src/jobs/jobs.dto";

import {
  expectEnum,
  expectNullableNumber,
  expectNullableString,
} from "../utils/data-helpers";

export const getJobPayload = (data?: Partial<TJob>): CreateJobDto => ({
  title: faker.string.alphanumeric(10),
  companyName: faker.company.name(),
  description: faker.string.sample(15),
  status: data?.status ?? "saved",
  ...data,
});

export const expectedJobStructure = () =>
  expect.objectContaining({
    title: expect.any(String),
    companyName: expect.any(String),
    description: expect.any(String),
    status: expectEnum(statusEnum.enumValues),
    roleId: expectNullableNumber,
    deadline: expectNullableString,
    interviewDate: expectNullableString,
    location: expectNullableString,
    source: expectNullableString,
    links: expectNullableString,
    notes: expectNullableString,
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });
