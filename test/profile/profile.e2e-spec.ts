import type { INestApplication } from "@nestjs/common";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";

import {
  expectedEducationStructure,
  expectedJobPreferenceStructure,
  expectedProfileStructure,
  expectedWorkExperienceStructure,
  getEducationPayload,
  getJobPreferencePayload,
  getProfilePayload,
  getWorkExperiencePayload,
  getWorkOverviewPayload,
} from "./profile.test-data";
import { getTestAuthHeader } from "../utils/auth-helpers";
import { bootstrapTestServer } from "../utils/bootstrap";

const isAppMode = Boolean(process.env.IS_APP_MODE);

describe("Profile (e2e)", () => {
  let app: INestApplication;
  let httpServer: ReturnType<typeof supertest>;
  let dbService: IDatabaseService;
  let authCookie: string;
  let testUserId: string;

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
    const { cookie, userId } = await getTestAuthHeader(
      app,
      dbService.database(),
    );

    authCookie = cookie;
    testUserId = userId ?? "app";

    await dbService.create("profiles", {
      id: testUserId,
      firstName: "",
      lastName: "",
    });
  });

  const auth = (req: supertest.Test, userCookie?: string): supertest.Test => {
    if (isAppMode) return req;
    return req.set("Cookie", userCookie ?? authCookie);
  };

  describe("GET /profile", () => {
    it("should return empty profile structure when none exists", async () => {
      const { body } = await auth(httpServer.get("/profile")).expect(200);

      expect(body.statusCode).toBe(200);
      expect(body.data).toMatchObject({
        firstName: "",
        lastName: "",
        links: [],
        workOverviews: [],
        workExperiences: [],
        educations: [],
        jobPreferences: [],
      });
    });

    it("should auto-create a profile on first access when none exists", async () => {
      await dbService.delete("profiles", { id: testUserId });

      const { body } = await auth(httpServer.get("/profile")).expect(200);

      expect(body.statusCode).toBe(200);
      expect(body.data.firstName).toBeDefined();
      expect(body.data.links).toEqual([]);
    });

    it("should return profile with all sections after creation", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);

      expect(body.data).toMatchObject(expectedProfileStructure());
      expect(body.data.firstName).toBe(profilePayload.firstName);
      expect(body.data.lastName).toBe(profilePayload.lastName);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.get("/profile").expect(401);
    });
  });

  describe("PUT /profile", () => {
    it("should create a new profile", async () => {
      const payload = getProfilePayload();

      await auth(httpServer.put("/profile")).send(payload).expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.firstName).toBe(payload.firstName);
      expect(body.data.lastName).toBe(payload.lastName);
      expect(body.data.email).toBe(payload.email);
    });

    it("should update an existing profile", async () => {
      const payload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(payload).expect(204);

      const updated = {
        firstName: "Updated",
        lastName: "Name",
        phone: "+1234567890",
      };
      await auth(httpServer.put("/profile")).send(updated).expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.firstName).toBe("Updated");
      expect(body.data.lastName).toBe("Name");
      expect(body.data.phone).toBe("+1234567890");
    });

    it("should return 400 when firstName is missing", async () => {
      await auth(httpServer.put("/profile"))
        .send({ lastName: "Name" })
        .expect(400);
    });

    it("should return 400 when firstName is empty", async () => {
      await auth(httpServer.put("/profile"))
        .send({ firstName: "", lastName: "Name" })
        .expect(400);
    });

    it("should return 400 for invalid email", async () => {
      await auth(httpServer.put("/profile"))
        .send({ firstName: "Test", email: "not-an-email" })
        .expect(400);
    });

    it("should return 400 for invalid country code", async () => {
      await auth(httpServer.put("/profile"))
        .send({ firstName: "Test", country: "USA" })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer.put("/profile").send(getProfilePayload()).expect(401);
    });
  });

  describe("PUT /profile/work-overview", () => {
    it("should create a work overview", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const overview = getWorkOverviewPayload();
      await auth(httpServer.put("/profile/work-overview"))
        .send(overview)
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.workOverviews).toHaveLength(1);
      expect(body.data.workOverviews[0].title).toBe(overview.title);
    });

    it("should update an existing work overview", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const overview = getWorkOverviewPayload();
      await auth(httpServer.put("/profile/work-overview"))
        .send(overview)
        .expect(204);

      const updated = { title: "Updated Title" };
      await auth(httpServer.put("/profile/work-overview"))
        .send(updated)
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.workOverviews[0].title).toBe("Updated Title");
    });

    it("should return 400 when title is missing", async () => {
      await auth(httpServer.put("/profile/work-overview"))
        .send({ experienceLevel: "senior" })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;
      await httpServer
        .put("/profile/work-overview")
        .send(getWorkOverviewPayload())
        .expect(401);
    });
  });

  describe("PUT /profile/work-experience", () => {
    it("should add work experiences", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const exp = getWorkExperiencePayload();
      await auth(httpServer.put("/profile/work-experience"))
        .send({ experiences: [exp] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.workExperiences).toHaveLength(1);
      expect(body.data.workExperiences[0]).toMatchObject(
        expectedWorkExperienceStructure(),
      );
      expect(body.data.workExperiences[0].company).toBe(exp.company);
    });

    it("should update an existing experience by id", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const exp = getWorkExperiencePayload();
      await auth(httpServer.put("/profile/work-experience"))
        .send({ experiences: [exp] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const expId: string = firstGet.data.workExperiences[0].id;

      const updated = {
        id: expId,
        company: "Updated Corp",
        title: "Updated Role",
        startDate: "2021-01",
        isCurrent: true,
      };
      await auth(httpServer.put("/profile/work-experience"))
        .send({ experiences: [updated] })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.workExperiences).toHaveLength(1);
      expect(secondGet.data.workExperiences[0].company).toBe("Updated Corp");
    });

    it("should delete experiences omitted from the array", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const exp1 = getWorkExperiencePayload();
      const exp2 = getWorkExperiencePayload();
      await auth(httpServer.put("/profile/work-experience"))
        .send({ experiences: [exp1, exp2] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const keepId: string = firstGet.data.workExperiences[0].id;

      await auth(httpServer.put("/profile/work-experience"))
        .send({ experiences: [{ ...getWorkExperiencePayload(), id: keepId }] })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.workExperiences).toHaveLength(1);
      expect(secondGet.data.workExperiences[0].id).toBe(keepId);
    });

    it("should return 400 for invalid payload", async () => {
      await auth(httpServer.put("/profile/work-experience"))
        .send({
          experiences: [
            { company: "", title: "", startDate: "", isCurrent: false },
          ],
        })
        .expect(400);
    });

    it("should clear all experiences when empty array is sent", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      await auth(httpServer.put("/profile/work-experience"))
        .send({ experiences: [getWorkExperiencePayload()] })
        .expect(204);

      await auth(httpServer.put("/profile/work-experience"))
        .send({ experiences: [] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.workExperiences).toHaveLength(0);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .put("/profile/work-experience")
        .send({ experiences: [getWorkExperiencePayload()] })
        .expect(401);
    });
  });

  describe("PUT /profile/education", () => {
    it("should add education entries", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const edu = getEducationPayload();
      await auth(httpServer.put("/profile/education"))
        .send({ education: [edu] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.educations).toHaveLength(1);
      expect(body.data.educations[0]).toMatchObject(
        expectedEducationStructure(),
      );
      expect(body.data.educations[0].institution).toBe(edu.institution);
    });

    it("should update existing education by id", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const edu = getEducationPayload();
      await auth(httpServer.put("/profile/education"))
        .send({ education: [edu] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const eduId: string = firstGet.data.educations[0].id;

      const updated = {
        id: eduId,
        degreeName: "Master of Science",
        institution: "New University",
      };
      await auth(httpServer.put("/profile/education"))
        .send({ education: [updated] })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.educations).toHaveLength(1);
      expect(secondGet.data.educations[0].degreeName).toBe("Master of Science");
    });

    it("should delete education entries omitted from the array", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      await auth(httpServer.put("/profile/education"))
        .send({ education: [getEducationPayload(), getEducationPayload()] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const keepId: string = firstGet.data.educations[0].id;

      await auth(httpServer.put("/profile/education"))
        .send({
          education: [{ degreeName: "PhD", institution: "MIT", id: keepId }],
        })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.educations).toHaveLength(1);
    });

    it("should return 400 for invalid education payload", async () => {
      await auth(httpServer.put("/profile/education"))
        .send({
          education: [{ degreeName: "", institution: "" }],
        })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .put("/profile/education")
        .send({ education: [getEducationPayload()] })
        .expect(401);
    });
  });

  describe("PUT /profile/preferences", () => {
    it("should create job preferences", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const pref = getJobPreferencePayload();
      await auth(httpServer.put("/profile/preferences")).send(pref).expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.jobPreferences).toHaveLength(1);
      expect(body.data.jobPreferences[0]).toMatchObject(
        expectedJobPreferenceStructure(),
      );
      expect(body.data.jobPreferences[0].workType).toBe("remote");
    });

    it("should update existing preferences", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const pref = getJobPreferencePayload();
      await auth(httpServer.put("/profile/preferences")).send(pref).expect(204);

      await auth(httpServer.put("/profile/preferences"))
        .send({ workType: "hybrid", salaryExpected: 200000 })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.jobPreferences[0].workType).toBe("hybrid");
      expect(body.data.jobPreferences[0].salaryExpected).toBe(200000);
    });

    it("should return 400 for empty payload", async () => {
      await auth(httpServer.put("/profile/preferences")).send({}).expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .put("/profile/preferences")
        .send(getJobPreferencePayload())
        .expect(401);
    });
  });

  describe("PUT /profile/links", () => {
    it("should add profile links", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      await auth(httpServer.put("/profile/links"))
        .send({
          links: [
            { type: "linkedin", url: "https://linkedin.com/in/test" },
            { type: "github", url: "https://github.com/test" },
          ],
        })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.links).toHaveLength(2);
    });

    it("should replace all links on update", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      await auth(httpServer.put("/profile/links"))
        .send({
          links: [{ type: "linkedin", url: "https://linkedin.com/in/test" }],
        })
        .expect(204);

      await auth(httpServer.put("/profile/links"))
        .send({ links: [{ type: "portfolio", url: "https://portfolio.dev" }] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.links).toHaveLength(1);
      expect(body.data.links[0].type).toBe("portfolio");
    });

    it("should return 400 for invalid URL", async () => {
      await auth(httpServer.put("/profile/links"))
        .send({ links: [{ type: "linkedin", url: "not-a-url" }] })
        .expect(400);
    });

    it("should return 400 for invalid link type", async () => {
      await auth(httpServer.put("/profile/links"))
        .send({ links: [{ type: "invalid-type", url: "https://example.com" }] })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .put("/profile/links")
        .send({
          links: [{ type: "linkedin", url: "https://linkedin.com/in/test" }],
        })
        .expect(401);
    });
  });
});
