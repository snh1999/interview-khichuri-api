import type { INestApplication } from "@nestjs/common";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";

import {
  expectedCalendarEventStructure,
  getCalendarEventPayload,
} from "./calendar.test-data";
import { getTestAuthHeader } from "../utils/auth-helpers";
import { bootstrapTestServer } from "../utils/bootstrap";

const isAppMode = Boolean(process.env.IS_APP_MODE);

// SQLite stores timestamps at second precision; postgres keeps milliseconds.
const normalizeDate = (value: string): string =>
  isAppMode
    ? new Date(new Date(value).setMilliseconds(0)).toISOString()
    : value;

describe("Calendar (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let authCookie: string;

  beforeAll(async () => {
    const { appInstance, httpServerInstance, dbServiceInstance } =
      await bootstrapTestServer();
    app = appInstance;
    httpServer = httpServerInstance;
    dbService = dbServiceInstance;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dbService.dbClear();
    if (!isAppMode) {
      const { cookie } = await getTestAuthHeader(app, dbService.database());
      authCookie = cookie;
    }
  });

  const auth = (req: supertest.Test, userCookie?: string): supertest.Test => {
    if (isAppMode) return req;
    return req.set("Cookie", userCookie ?? authCookie);
  };

  const createEvent = (
    payload: Record<string, unknown> = getCalendarEventPayload(),
    userCookie?: string,
  ) =>
    auth(httpServer.post("/calendar/events"), userCookie)
      .send(payload)
      .expect(201);

  describe("POST /calendar/events", () => {
    it("should create a calendar event with defaults", async () => {
      const payload = getCalendarEventPayload();
      const { body } = await createEvent(payload);

      expect(body.statusCode).toBe(201);
      expect(body.data).toMatchObject({
        title: payload.title,
        description: payload.description,
        source: "custom",
        color: null,
      });
      expect(body.data.id).toEqual(expect.any(String));
    });

    it("should create an event with all optional fields", async () => {
      const payload = getCalendarEventPayload({
        description: "Detailed description",
        color: "emerald",
        source: "job",
        sourceId: "some-source-id",
      });

      const { body } = await createEvent(payload);

      expect(body.data).toMatchObject({
        title: payload.title,
        description: "Detailed description",
        color: "emerald",
        source: "job",
        sourceId: "some-source-id",
      });
    });

    it("should return 400 when title is missing", async () => {
      await auth(httpServer.post("/calendar/events"))
        .send({
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
        })
        .expect(400);
    });

    it("should return 400 when title is empty", async () => {
      await auth(httpServer.post("/calendar/events"))
        .send({ ...getCalendarEventPayload(), title: "" })
        .expect(400);
    });

    it("should return 400 when startDate is missing", async () => {
      await auth(httpServer.post("/calendar/events"))
        .send({ title: "Test", endDate: new Date().toISOString() })
        .expect(400);
    });

    it("should return 400 when endDate is missing", async () => {
      await auth(httpServer.post("/calendar/events"))
        .send({ title: "Test", startDate: new Date().toISOString() })
        .expect(400);
    });

    it("should return 400 when endDate is before startDate", async () => {
      const start = new Date();
      await auth(httpServer.post("/calendar/events"))
        .send(
          getCalendarEventPayload({
            startDate: start.toISOString(),
            endDate: new Date(start.getTime() - 60_000).toISOString(),
          }),
        )
        .expect(400);
    });

    it("should return 400 when endDate equals startDate", async () => {
      const same = new Date().toISOString();
      await auth(httpServer.post("/calendar/events"))
        .send(getCalendarEventPayload({ startDate: same, endDate: same }))
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer
        .post("/calendar/events")
        .send(getCalendarEventPayload())
        .expect(401);
    });
  });

  describe("GET /calendar/events", () => {
    it("should return empty list when no events exist", async () => {
      const { body } = await auth(httpServer.get("/calendar/events")).expect(
        200,
      );

      expect(body.data).toEqual([]);
    });

    it("should return all events for the authenticated user", async () => {
      await createEvent();
      await createEvent();

      const { body } = await auth(httpServer.get("/calendar/events")).expect(
        200,
      );

      expect(body.data).toHaveLength(2);
      expect(body.data[0]).toMatchObject(expectedCalendarEventStructure());
      expect(body.data[1]).toMatchObject(expectedCalendarEventStructure());
    });

    it("should not return events belonging to other users in web mode", async () => {
      await createEvent();

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );

      await httpServer
        .get("/calendar/events")
        .set("Cookie", otherCookie)
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data).toHaveLength(isAppMode ? 1 : 0);
        });
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.get("/calendar/events").expect(401);
    });
  });

  describe("PATCH /calendar/events/:id", () => {
    it("should update event title", async () => {
      const payload = getCalendarEventPayload();
      const { body: created } = await createEvent(payload);
      const eventId: string = created.data.id;

      const newTitle = "Updated Event Title";

      await auth(httpServer.patch(`/calendar/events/${eventId}`))
        .send({ title: newTitle })
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.title).toBe(newTitle);
        });
    });

    it("should update multiple fields", async () => {
      const { body: created } = await createEvent();
      const eventId: string = created.data.id;

      const newTitle = "Updated Title";
      const newDescription = "Updated description";

      const { body } = await auth(
        httpServer.patch(`/calendar/events/${eventId}`),
      )
        .send({ title: newTitle, description: newDescription })
        .expect(200);

      expect(body.data).toMatchObject({
        title: newTitle,
        description: newDescription,
      });
    });

    it("should update dates", async () => {
      const { body: created } = await createEvent();
      const eventId: string = created.data.id;

      const newStart = new Date(Date.now() + 172_800_000).toISOString();
      const newEnd = new Date(Date.now() + 176_400_000).toISOString();

      const { body } = await auth(
        httpServer.patch(`/calendar/events/${eventId}`),
      )
        .send({ startDate: newStart, endDate: newEnd })
        .expect(200);

      expect(body.data.startDate).toEqual(normalizeDate(newStart));
      expect(body.data.endDate).toEqual(normalizeDate(newEnd));
    });

    it("should return 400 when patching with empty title", async () => {
      const { body: created } = await createEvent();
      const eventId: string = created.data.id;

      await auth(httpServer.patch(`/calendar/events/${eventId}`))
        .send({ title: "" })
        .expect(400);
    });

    it("should return 400 when patch moves startDate past endDate", async () => {
      const { body: created } = await createEvent();
      const eventId: string = created.data.id;

      await auth(httpServer.patch(`/calendar/events/${eventId}`))
        .send({
          startDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        })
        .expect(400);
    });

    it("should return 400 when patch moves endDate before startDate", async () => {
      const { body: created } = await createEvent();
      const eventId: string = created.data.id;

      await auth(httpServer.patch(`/calendar/events/${eventId}`))
        .send({ endDate: new Date(Date.now() - 86_400_000).toISOString() })
        .expect(400);
    });

    it("should return 400 for non-uuid id", async () => {
      await auth(httpServer.patch("/calendar/events/invalid-id"))
        .send({ title: "Nope" })
        .expect(400);
    });

    it("should return 404 when patching non-existent event", async () => {
      const fakeId: string = crypto.randomUUID();

      await auth(httpServer.patch(`/calendar/events/${fakeId}`))
        .send({ title: "Nope" })
        .expect(404);
    });

    it("should return 404 when patching another user's event", async () => {
      const { body: created } = await createEvent();
      const eventId: string = created.data.id;

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      await httpServer
        .patch(`/calendar/events/${eventId}`)
        .set("Cookie", otherCookie)
        .send({ title: "Hacked" })
        .expect(isAppMode ? 200 : 404);
    });
  });

  describe("DELETE /calendar/events/:id", () => {
    it("should delete an event and return 204", async () => {
      const { body: created } = await createEvent();
      const eventId: string = created.data.id;

      await auth(httpServer.delete(`/calendar/events/${eventId}`)).expect(204);
    });

    it("should remove the event from the list after deletion", async () => {
      const { body: created } = await createEvent();
      const eventId: string = created.data.id;
      await createEvent();

      await auth(httpServer.delete(`/calendar/events/${eventId}`)).expect(204);

      const { body } = await auth(httpServer.get("/calendar/events")).expect(
        200,
      );
      const ids = (body.data as { id: string }[]).map((e) => e.id);
      expect(ids).not.toContain(eventId);
    });

    it("should return 400 when deleting non-uuid id", async () => {
      await auth(httpServer.delete("/calendar/events/invalid_id")).expect(400);
    });

    it("should return 404 when deleting non-existent event", async () => {
      const fakeId: string = crypto.randomUUID();
      await auth(httpServer.delete(`/calendar/events/${fakeId}`)).expect(404);
    });

    it("should return 404 when deleting another user's event", async () => {
      if (isAppMode) return;

      const { body: created } = await createEvent();
      const eventId: string = created.data.id;

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      const { body } = await httpServer
        .delete(`/calendar/events/${eventId}`)
        .set("Cookie", otherCookie)
        .expect(404);

      expect(body.statusCode).toBe(404);
    });
  });
});
