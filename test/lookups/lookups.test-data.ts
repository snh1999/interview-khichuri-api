/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-unsafe-return */

import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

import type { TRole, TRoleInsert } from "@/src/database/database.types";

export const getRolePayload = (data?: Partial<TRole>): TRoleInsert => ({
  name: faker.string.alphanumeric(10),
  ...data,
});

export const expectedRoleStructure = () =>
  expect.objectContaining({
    id: expect.any(Number),
    name: expect.any(String),
    isApproved: null,
  });
