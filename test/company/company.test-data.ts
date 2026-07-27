/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-unsafe-return */

import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

export const getCompanyPayload = () => ({
  name: faker.company.name(),
});

export const expectedCompanyStructure = () =>
  expect.objectContaining({
    id: expect.any(Number),
    name: expect.any(String),
  });
