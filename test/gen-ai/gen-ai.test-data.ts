/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-unsafe-return */
import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

import type {
  TApiKeyInsert,
  TApiKeyPlatform,
} from "@/src/database/database.types";
import { platformEnum } from "@/src/database/postgres/schemas";

import { expectEnum, expectNullableBoolean } from "../utils/data-helpers";

export const platform: TApiKeyPlatform = "google";

export const getApiKeyPayload = (
  data?: Partial<TApiKeyInsert>,
): TApiKeyInsert => ({
  name: faker.string.alphanumeric(10),
  platform,
  key: faker.string.alphanumeric(20),
  isActive: false,
  ...data,
});

export const expectedApiKeyStructure = () =>
  expect.objectContaining({
    id: expect.any(String),
    name: expect.any(String),
    platform: expectEnum(platformEnum.enumValues),
    isActive: expectNullableBoolean,
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });
