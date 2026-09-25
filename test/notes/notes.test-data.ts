/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { faker } from "@faker-js/faker/locale/en";

export const getNotePayload = (overrides: Record<string, unknown> = {}) => ({
  title: faker.lorem.words(4),
  details: faker.lorem.paragraph(),
  isFavorite: faker.datatype.boolean(),
  ...overrides,
});
