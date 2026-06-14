import { faker } from "@faker-js/faker/locale/en";
import type supertest from "supertest";

import type { TRole, TTopics } from "@/src/database/database.types";

export const createTestRole = async (
  httpServer: ReturnType<typeof supertest>,
  cookie: string,
): Promise<TRole> => {
  const req = httpServer.post("/lookups/roles");
  if (cookie) req.set("Cookie", cookie);
  const { body } = await req.send({ name: faker.word.noun() }).expect(201);
  return body.data as TRole;
};

export const createTestTopic = async (
  httpServer: ReturnType<typeof supertest>,
  cookie: string,
): Promise<TTopics> => {
  const req = httpServer.post("/lookups/topics");
  if (cookie) req.set("Cookie", cookie);
  const { body } = await req.send({ name: faker.word.noun() }).expect(201);

  return body.data as TTopics;
};
