/* eslint-disable @typescript-eslint/no-unsafe-return */
import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

import type { TJob } from "@/src/database/database.types";
import { statusEnum } from "@/src/database/postgres/schemas";

import { expectEnum } from "../utils/data-helpers";

export const getJobPayload = (data?: Partial<TJob>): TJob => ({
  title: faker.string.alphanumeric(10),
  description: faker.string.sample(15),
  ...data,
});

export const expectedJobStructure = () =>
  expect.objectContaining({
    title: expect.any(String),
    description: expect.any(String),
    status: expectEnum(statusEnum.enumValues),
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });

//   status: statusEnum("status").notNull().default("saved"),
//   roleId: integer("role_id").references(() => roles.id, {
//   onDelete: "set null",
// }),
//   deadline: timestamp("deadline"),
//   createdAt: timestamp("created_at").defaultNow().notNull(),
//   updatedAt: timestamp("updated_at")
