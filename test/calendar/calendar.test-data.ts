/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-unsafe-return */
import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

import type { TCalendarEvent } from "@/src/database/database.types";

const isAppMode = Boolean(process.env.IS_APP_MODE);

export type TCalendarEventPayload = Partial<
  Omit<TCalendarEvent, "startDate" | "endDate">
> & {
  startDate?: string | Date;
  endDate?: string | Date;
};

export const getCalendarEventPayload = (
  data?: TCalendarEventPayload,
): Record<string, unknown> => ({
  title: faker.string.alphanumeric(20),
  description: faker.string.sample(30),
  startDate: new Date(Date.now() + 86_400_000).toISOString(),
  endDate: new Date(Date.now() + 90_000_000).toISOString(),
  source: "custom",
  sourceId: null,
  ...data,
});

export const expectedCalendarEventStructure = () =>
  expect.objectContaining({
    id: expect.any(String),
    ...(isAppMode ? { userId: null } : { userId: expect.any(String) }),
    title: expect.any(String),
    description: expect.any(String),
    startDate: expect.any(String),
    endDate: expect.any(String),
    source: expect.any(String),
    sourceId: null,
    color: null,
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });
