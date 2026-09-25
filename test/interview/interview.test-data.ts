/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { faker } from "@faker-js/faker/locale/en";

export const getInterviewCreatePayload = (
  overrides: Record<string, unknown> = {},
) => ({
  sessionId: faker.string.uuid(),
  ...overrides,
});

export const getInterviewCreateWithFocusPayload = (
  overrides: Record<string, unknown> = {},
) => ({
  sessionId: faker.string.uuid(),
  focusTypes: ["topics" as const],
  topicNames: [faker.lorem.word()],
  ...overrides,
});

export const getTranscriptPayload = (
  overrides: Record<string, unknown> = {},
) => ({
  questionId: faker.number.int({ min: 1, max: 100000 }),
  question: faker.lorem.sentence(),
  answer: faker.lorem.paragraph(),
  seconds: faker.number.int({ min: 5, max: 300 }),
  ...overrides,
});

export const getCompletionPayload = (
  overrides: Record<string, unknown> = {},
) => ({
  provider: "google",
  transcript: [getTranscriptPayload()],
  elapsedSeconds: faker.number.int({ min: 30, max: 1800 }),
  ...overrides,
});
