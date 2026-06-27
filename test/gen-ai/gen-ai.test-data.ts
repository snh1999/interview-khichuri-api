/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-unsafe-return */
import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

import type {
  TApiKeyInsert,
  TApiKeyProvider,
} from "@/src/database/database.types";
import { providerEnum } from "@/src/database/postgres/schemas";

import {
  expectEnum,
  expectNullableBoolean,
  expectNullableString,
} from "../utils/data-helpers";

export const provider: TApiKeyProvider = "google";

export const getApiKeyPayload = (
  data?: Partial<TApiKeyInsert>,
): TApiKeyInsert => ({
  name: faker.string.alphanumeric(10),
  provider,
  key: faker.string.alphanumeric(20),
  isActive: false,
  ...data,
});

export const expectedApiKeyStructure = () =>
  expect.objectContaining({
    id: expect.any(String),
    name: expect.any(String),
    provider: expectEnum(providerEnum.enumValues),
    isActive: expectNullableBoolean,
    model: expectNullableString,
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });
