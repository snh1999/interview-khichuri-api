/* eslint-disable @typescript-eslint/no-misused-spread */
import type { INestApplication } from "@nestjs/common";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";
import type { TJobInsert, TJobWithTopics } from "@/src/database/database.types";
import type { CreateJobDto } from "@/src/jobs/jobs.dto";

import { expectedJobStructure, getJobPayload } from "./job.test-data";
import { getTestAuthHeader } from "../utils/auth-helpers";
import { bootstrapTestServer } from "../utils/bootstrap";
import { createTestRole, createTestTopic } from "../utils/test-data";

const isAppMode = Boolean(process.env.IS_APP_MODE);

describe("Jobs (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let authCookie: string;
  let jobPayload: TJobInsert;

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
    jobPayload = getJobPayload();
    if (!isAppMode) {
      const { cookie } = await getTestAuthHeader(app, dbService.database());
      authCookie = cookie;
    }
  });

  const auth = (req: supertest.Test, userCookie?: string): supertest.Test => {
    if (isAppMode) return req;
    return req.set("Cookie", userCookie ?? authCookie);
  };

  const createJob = (
    payload: Partial<CreateJobDto> = getJobPayload(),
    userCookie?: string,
  ) => auth(httpServer.post("/jobs"), userCookie).send(payload).expect(201);

  describe("POST /jobs", () => {
    it("should create a job with defaults", async () => {
      const jobPayload = getJobPayload();
      const { body } = await createJob(jobPayload);

      expect(body.statusCode).toBe(201);
      expect(body.message).toBe("");
      expect(body.data).toMatchObject({
        title: jobPayload.title,
        companyName: jobPayload.companyName,
        description: jobPayload.description,
        status: "saved",
      });
      expect(body.data.id).toEqual(expect.any(String));
      expect(body.data.roleId).toBeNull();
      if (!isAppMode) expect(body.data.userId).toEqual(expect.any(String));
    });

    it("should return 400 when title is missing", async () =>
      auth(httpServer.post("/jobs")).send({ description: "desc" }).expect(400));

    it("should return 400 when description is missing", async () => {
      await auth(httpServer.post("/jobs")).send({ title: "t" }).expect(400);
    });

    it("should return 400 when title is empty", async () => {
      await auth(httpServer.post("/jobs"))
        .send({ title: "", description: "desc" })
        .expect(400);
    });

    it("should return 400 when companyName is missing", async () =>
      auth(httpServer.post("/jobs"))
        .send({ title: "t", description: "desc" })
        .expect(400));

    it("should return 400 when companyName is empty", async () => {
      await auth(httpServer.post("/jobs"))
        .send({ title: "t", companyName: "", description: "desc" })
        .expect(400);
    });

    it("should return 400 for invalid status value", async () => {
      await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, status: "invalid" })
        .expect(400);
    });

    it("should return 400 for non-integer roleId", async () => {
      await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, roleId: "abc" })
        .expect(400);
    });

    it("should create a job with non default status", async () => {
      await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, status: "scheduled" })
        .expect(201)
        .expect(({ body: { data } }) => {
          expect(data.status).toBe("scheduled");
        });
    });

    it("should return 400 for roleId of 0 (non-positive)", async () => {
      await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, roleId: 0 })
        .expect(400);
    });

    it("should create a job with a valid roleId", async () => {
      const role = await createTestRole(httpServer, authCookie);
      const roleId: number = role.id;

      const { body } = await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, roleId })
        .expect(201);

      expect(body.data.roleId).toBe(roleId);
    });

    it("should create a job with topicIds", async () => {
      const topic1 = await createTestTopic(httpServer, authCookie);
      const topic2 = await createTestTopic(httpServer, authCookie);

      const topicIds = [topic1.id, topic2.id];

      const { body } = await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, topicIds })
        .expect(201);

      expect(body.data.topicIds).toBeUndefined();
    });

    it("should create a job with links and notes", async () => {
      const payload = {
        ...jobPayload,
        links: "https://example.com/job-posting",
        notes: "Follow up with recruiter",
      };

      const { body } = await auth(httpServer.post("/jobs"))
        .send(payload)
        .expect(201);

      expect(body.data.links).toBe(payload.links);
      expect(body.data.notes).toBe(payload.notes);
    });

    it("should create a job with deadline", async () => {
      const deadline = "2025-12-31T23:59:59.000Z";

      const { body } = await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, deadline })
        .expect(201);

      expect(body.data.deadline).toEqual(expect.any(String));
    });

    it("should return 400 for non-integer topicIds", async () => {
      await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, topicIds: ["abc"] })
        .expect(400);
    });

    it("should return 400 for topicIds with non-positive values", async () => {
      await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, topicIds: [0] })
        .expect(400);
    });

    it("should create a job with topicNames", async () => {
      const topicNames = ["TypeScript", "React"];

      const { body } = await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, topicNames })
        .expect(201);

      const jobId: string = body.data.id;

      const { body: fetchedJob } = await auth(
        httpServer.get(`/jobs/${jobId}`),
      ).expect(200);

      expect(fetchedJob.data.jobTopics).toHaveLength(2);
      const fetchedNames = (fetchedJob.data as TJobWithTopics).jobTopics.map(
        (jt: { topic: { name: string } }) => jt.topic.name,
      );
      expect(fetchedNames).toEqual(expect.arrayContaining(topicNames));
    });

    it("should create a job with both topicIds and topicNames", async () => {
      const existingTopic = await createTestTopic(httpServer, authCookie);
      const topicNames = ["New Topic"];

      const { body } = await auth(httpServer.post("/jobs"))
        .send({
          ...jobPayload,
          topicIds: [existingTopic.id],
          topicNames,
        })
        .expect(201);

      const jobId: string = body.data.id;

      const { body: fetched } = await auth(
        httpServer.get(`/jobs/${jobId}`),
      ).expect(200);

      expect(fetched.data.jobTopics).toHaveLength(2);
      const fetchedNames = (fetched.data as TJobWithTopics).jobTopics.map(
        (jt: { topic: { name: string } }) => jt.topic.name,
      );
      expect(fetchedNames).toContain(existingTopic.name);
      expect(fetchedNames).toContain("New Topic");
    });

    it("should return 400 for topicNames with empty string", async () => {
      await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, topicNames: [""] })
        .expect(400);
    });

    it("should return 400 for whitespace-only title", async () => {
      await auth(httpServer.post("/jobs"))
        .send({ title: "   ", description: "desc" })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.post("/jobs").send(jobPayload).expect(401);
    });
  });

  describe("GET /jobs", () => {
    it("should return empty list when no jobs exist", async () => {
      const { body } = await auth(httpServer.get("/jobs")).expect(200);

      expect(body.data).toEqual([]);
    });

    it("should return all jobs for the authenticated user", async () => {
      await createJob();
      await createJob();

      await auth(httpServer.get("/jobs"))
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data).toHaveLength(2);
          expect(data[0]).toMatchObject(expectedJobStructure());
          expect(data[1]).toMatchObject(expectedJobStructure());
        });
    });

    it("should not return jobs belonging to other users in web mode", async () => {
      await createJob();

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );

      await httpServer
        .get("/jobs")
        .set("Cookie", otherCookie)
        .expect(200)
        .expect(({ body: { data: userJob } }) => {
          expect(userJob).toHaveLength(isAppMode ? 1 : 0);
        });
    });

    it("should return only jobs belonging to other user in web mode", async () => {
      await createJob();

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );

      await createJob(getJobPayload(), otherCookie);
      await createJob(getJobPayload(), otherCookie);

      await httpServer
        .get("/jobs")
        .set("Cookie", otherCookie)
        .expect(200)
        .expect(({ body: { data: otherUserJob } }) => {
          expect(otherUserJob).toHaveLength(isAppMode ? 3 : 2);
        });

      await auth(httpServer.get("/jobs"))
        .expect(200)
        .expect(({ body: { data: userJob } }) => {
          expect(userJob).toHaveLength(isAppMode ? 3 : 1);
        });
    });

    it("should return jobs with all expected fields", async () => {
      const jobDto = getJobPayload();
      const {
        body: { data: createdPost },
      } = await createJob(jobDto);

      const { body } = await auth(httpServer.get("/jobs")).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        ...createdPost,
      });
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.get("/jobs").expect(401);
    });

    it("should search jobs by title", async () => {
      await createJob({
        ...getJobPayload(),
        title: "React Developer",
        description: "Frontend role",
      });
      await createJob({
        ...getJobPayload(),
        title: "Backend Engineer",
        description: "API role",
      });

      const { body } = await auth(httpServer.get("/jobs?search=react")).expect(
        200,
      );

      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("React Developer");
    });

    it("should return empty list when search does not match", async () => {
      await createJob({
        ...getJobPayload(),
        title: "React Developer",
        description: "Frontend role",
      });

      const { body } = await auth(
        httpServer.get("/jobs?search=nonexistent"),
      ).expect(200);

      expect(body.data).toEqual([]);
    });

    it("should return all jobs when no search query given", async () => {
      await createJob({
        ...getJobPayload(),
        title: "Job A",
        description: "Desc A",
      });
      await createJob({
        ...getJobPayload(),
        title: "Job B",
        description: "Desc B",
      });

      const { body } = await auth(httpServer.get("/jobs")).expect(200);

      expect(body.data).toHaveLength(2);
    });

    it("should search jobs by description", async () => {
      await createJob({
        ...getJobPayload(),
        title: "Frontend Dev",
        description: "React and TypeScript",
      });
      await createJob({
        ...getJobPayload(),
        title: "Backend Dev",
        description: "Node and Postgres",
      });

      const { body } = await auth(
        httpServer.get("/jobs?search=typescript"),
      ).expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].description).toBe("React and TypeScript");
    });

    it("should return multiple jobs when search matches several", async () => {
      await createJob({
        ...getJobPayload(),
        title: "Junior Developer",
        description: "Entry level",
      });
      await createJob({
        ...getJobPayload(),
        title: "Senior Developer",
        description: "Lead role",
      });
      await createJob({
        ...getJobPayload(),
        title: "DevOps Engineer",
        description: "Infra role",
      });

      const { body } = await auth(
        httpServer.get("/jobs?search=developer"),
      ).expect(200);

      expect(body.data).toHaveLength(2);
    });

    it("should scope search to the authenticated user in web mode", async () => {
      if (isAppMode) return;

      await createJob({
        ...getJobPayload(),
        title: "My Job",
        description: "Belongs to me",
      });

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      await createJob(
        {
          title: "Other Job",
          companyName: "Other Inc",
          description: "Not mine",
        },
        otherCookie,
      );

      const { body } = await auth(httpServer.get("/jobs?search=job")).expect(
        200,
      );

      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("My Job");
    });

    it("should paginate jobs", async () => {
      await createJob();
      await createJob();

      const { body: page1 } = await auth(
        httpServer.get("/jobs?page=1&limit=1"),
      ).expect(200);

      expect(page1.data).toHaveLength(1);

      const { body: page2 } = await auth(
        httpServer.get("/jobs?page=2&limit=1"),
      ).expect(200);

      expect(page2.data).toHaveLength(1);
    });

    it("should sort jobs by title ascending", async () => {
      await createJob({ ...getJobPayload(), title: "B Job" });
      await createJob({ ...getJobPayload(), title: "A Job" });

      const { body } = await auth(
        httpServer.get("/jobs?sort=title:asc"),
      ).expect(200);

      expect(body.data[0].title).toBe("A Job");
      expect(body.data[1].title).toBe("B Job");
    });

    it("should sort jobs by title descending", async () => {
      await createJob({ ...getJobPayload(), title: "A Job" });
      await createJob({ ...getJobPayload(), title: "B Job" });

      const { body } = await auth(
        httpServer.get("/jobs?sort=title:desc"),
      ).expect(200);

      expect(body.data[0].title).toBe("B Job");
      expect(body.data[1].title).toBe("A Job");
    });

    it("should return 400 for invalid sort column", async () => {
      const { body } = await auth(
        httpServer.get("/jobs?sort=invalidColumn:asc"),
      ).expect(400);

      expect(body.statusCode).toBe(400);
    });
  });

  describe("GET /jobs/:id", () => {
    it("should return a job by id", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;

      const { body } = await auth(httpServer.get(`/jobs/${jobId}`)).expect(200);

      expect(body.data).toMatchObject({ ...created });
      expect(body.data).toMatchObject(expectedJobStructure());
      expect(body.data.jobTopics).toEqual([]);
    });

    it("should return populated jobTopics when job has topics", async () => {
      const topic = await createTestTopic(httpServer, authCookie);
      const topicIds = [topic.id];

      const {
        body: { data: created },
      } = await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, topicIds })
        .expect(201);
      const jobId: string = created.id;

      const { body } = await auth(httpServer.get(`/jobs/${jobId}`)).expect(200);

      expect(body.data.jobTopics).toHaveLength(1);
      expect(body.data.jobTopics[0].topic.id).toBe(topicIds[0]);
    });

    it("should return 404 trying to access other user's job by id in web mode", async () => {
      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      const {
        body: { data },
      } = await createJob(getJobPayload(), otherCookie);

      const jobId: string = data.id;

      await auth(httpServer.get(`/jobs/${jobId}`)).expect(
        isAppMode ? 200 : 404,
      );
    });

    it("should return 400 for non-uuid id", async () => {
      const fakeId = "invalid_id";

      await auth(httpServer.get(`/jobs/${fakeId}`)).expect(400);
    });

    it("should return 404 for non-existent id", async () => {
      const fakeId: string = crypto.randomUUID();

      await auth(httpServer.get(`/jobs/${fakeId}`)).expect(404);
    });
  });

  describe("PATCH /jobs/:id", () => {
    it("should update title", async () => {
      const jobDto = getJobPayload();
      const { body: created } = await createJob(jobDto);
      const jobId: string = created.data.id;

      const newTitle = "New Job Title";

      await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ title: newTitle })
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.title).toBe(newTitle);
          expect(data).toMatchObject({
            ...jobDto,
            title: newTitle,
          });
        });
    });

    it("should update multiple fields", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;

      const title = "New Job Title";
      const description = "New Job Description";
      const status = "applied";

      const { body } = await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ title, description, status })
        .expect(200);

      expect(body.data).toMatchObject({ title, description, status });
    });

    it("should return 400 when patching with invalid status", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;

      await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ status: "invalid" })
        .expect(400);
    });

    it("should update roleId", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;

      const role = await createTestRole(httpServer, authCookie);
      const roleId: number = role.id;

      await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ roleId })
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.roleId).toBe(roleId);
        });
    });

    it("should update topicIds", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;

      const topic = await createTestTopic(httpServer, authCookie);
      const topicIds = [topic.id];

      await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ title: "Updated Job", topicIds })
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.title).toBe("Updated Job");
          expect(data.jobTopics).toHaveLength(1);
          expect(data.jobTopics[0].topic.id).toBe(topicIds[0]);
        });
    });

    it("should update links and notes", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;

      const links = "https://example.com/updated";
      const notes = "Updated notes about the job";

      const { body } = await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ links, notes })
        .expect(200);

      expect(body.data.links).toBe(links);
      expect(body.data.notes).toBe(notes);
    });

    it("should update deadline", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;

      const deadline = "2025-06-15T00:00:00.000Z";

      const { body } = await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ deadline })
        .expect(200);

      expect(body.data.deadline).toEqual(expect.any(String));
    });

    it("should update only topicIds", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;

      const topic = await createTestTopic(httpServer, authCookie);
      await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ topicIds: [topic.id] })
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.jobTopics).toHaveLength(1);
          expect(data.jobTopics[0].topic.id).toBe(topic.id);
        });
    });

    it("should update topicNames", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;
      const topicNames = ["FastAPI", "Docker"];

      await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ title: "Updated Job", topicNames })
        .expect(200)
        .expect(({ body: { data } }) => {
          expect(data.title).toBe("Updated Job");
          expect(data.jobTopics).toHaveLength(2);
          const jobTopics = (data as TJobWithTopics).jobTopics.map(
            (jt: { topic: { name: string } }) => jt.topic.name,
          );
          expect(jobTopics).toEqual(expect.arrayContaining(topicNames));
        });
    });

    it("should clear topicIds when patching with empty array", async () => {
      const topic = await createTestTopic(httpServer, authCookie);

      const {
        body: { data: created },
      } = await auth(httpServer.post("/jobs"))
        .send({ ...jobPayload, topicIds: [topic.id] })
        .expect(201);
      const jobId: string = created.id;

      const { body } = await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ topicIds: [] })
        .expect(200);

      expect(body.data.jobTopics).toHaveLength(0);
    });

    it("should return 400 when patching with non-integer roleId", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;

      await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ roleId: "abc" })
        .expect(400);
    });

    it("should return 400 when patching with empty title", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;

      await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ title: "" })
        .expect(400);
    });

    it("should return 400 when patching with topicIds with non-positive values", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;

      await auth(httpServer.patch(`/jobs/${jobId}`))
        .send({ topicIds: [0] })
        .expect(400);
    });

    it("should return 400 when patching non-uuid job", async () => {
      const fakeId = "invalid-id";

      await auth(httpServer.patch(`/jobs/${fakeId}`))
        .send({ title: "Nope" })
        .expect(400);
    });

    it("should return 404 when patching non-existent job", async () => {
      const fakeId: string = crypto.randomUUID();

      await auth(httpServer.patch(`/jobs/${fakeId}`))
        .send({ title: "Nope" })
        .expect(404);
    });

    it("should return 404 when patching another user's job", async () => {
      const {
        body: { data: created },
      } = await createJob();
      const jobId: string = created.id;

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      await httpServer
        .patch(`/jobs/${jobId}`)
        .set("Cookie", otherCookie)
        .send({ title: "Hacked" })
        .expect(isAppMode ? 200 : 404);
    });
  });

  describe("DELETE /jobs/:id", () => {
    it("should delete a job and return 204", async () => {
      const { body: created } = await createJob();
      const jobId: string = created.data.id;

      await auth(httpServer.delete(`/jobs/${jobId}`)).expect(204);
    });

    it("should remove the job from the list after deletion", async () => {
      const { body: created } = await createJob();
      const jobId: string = created.data.id;
      await createJob();
      await createJob();

      await auth(httpServer.delete(`/jobs/${jobId}`)).expect(204);

      const { body } = await auth(httpServer.get("/jobs")).expect(200);
      const ids = (body.data as { id: string }[]).map((j) => j.id);
      expect(ids).not.toContain(jobId);
    });

    it("should not affect other jobs when deleting one", async () => {
      const { body: job1 } = await createJob();
      const job1Id: string = job1.data.id;
      await createJob();
      await createJob();

      await auth(httpServer.delete(`/jobs/${job1Id}`)).expect(204);

      const { body } = await auth(httpServer.get("/jobs")).expect(200);
      expect(body.data).toHaveLength(2);
    });

    it("should return 400 when deleting non-uuid id", async () => {
      const fakeId = "invalid_id";

      await auth(httpServer.delete(`/jobs/${fakeId}`)).expect(400);
    });

    it("should return 404 when deleting non-existent job", async () => {
      const fakeId = crypto.randomUUID();
      await auth(httpServer.delete(`/jobs/${fakeId}`)).expect(404);
    });

    it("should return 404 when deleting another user's job", async () => {
      if (isAppMode) return;

      const { body: created } = await createJob();
      const jobId: string = created.data.id;

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );
      const { body } = await httpServer
        .delete(`/jobs/${jobId}`)
        .set("Cookie", otherCookie)
        .expect(404);

      expect(body.statusCode).toBe(404);
    });
  });
});
