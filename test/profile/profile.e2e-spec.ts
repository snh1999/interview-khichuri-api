import type { INestApplication } from "@nestjs/common";
import type supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { IDatabaseService } from "@/src/database/database.service";

import {
  expectedActivityStructure,
  expectedEducationStructure,
  expectedJobPreferenceStructure,
  expectedProfileStructure,
  expectedProjectStructure,
  expectedPublicationStructure,
  expectedReferenceStructure,
  expectedWorkExperienceStructure,
  getActivityPayload,
  getEducationPayload,
  getJobPreferencePayload,
  getProfilePayload,
  getProjectPayload,
  getPublicationPayload,
  getReferencePayload,
  getWorkExperiencePayload,
  getWorkOverviewPayload,
} from "./profile.test-data";
import { getTestAuthHeader } from "../utils/auth-helpers";
import { bootstrapTestServer } from "../utils/bootstrap";
import {
  createTestIndustry,
  createTestRole,
  createTestTopic,
} from "../utils/test-data";

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

  describe("profile data isolation", () => {
    it("should not leak one user's data to another user in web mode", async () => {
      if (isAppMode) return;

      await auth(httpServer.put("/profile"))
        .send(getProfilePayload())
        .expect(204);
      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [getProjectPayload()] })
        .expect(204);
      await auth(httpServer.put("/profile/work-experience"))
        .send({ experiences: [getWorkExperiencePayload()] })
        .expect(204);
      await auth(httpServer.put("/profile/publications"))
        .send({ publications: [getPublicationPayload()] })
        .expect(204);
      await auth(httpServer.put("/profile/references"))
        .send({ references: [getReferencePayload()] })
        .expect(204);
      await auth(httpServer.put("/profile/activities"))
        .send({ activities: [getActivityPayload()] })
        .expect(204);

      const { cookie: otherCookie } = await getTestAuthHeader(
        app,
        dbService.database(),
      );

      const { body } = await httpServer
        .get("/profile")
        .set("Cookie", otherCookie)
        .expect(200);

      expect(body.data.projects).toEqual([]);
      expect(body.data.workExperiences).toEqual([]);
      expect(body.data.publications).toEqual([]);
      expect(body.data.references).toEqual([]);
      expect(body.data.activities).toEqual([]);
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

    it("should sync skills and industries", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const topic = await createTestTopic(httpServer, authCookie);
      const industry = await createTestIndustry(httpServer, authCookie);

      await auth(httpServer.put("/profile/work-overview"))
        .send({
          ...getWorkOverviewPayload(),
          skills: [topic.id],
          industries: [industry.id],
        })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.workOverviews[0].skills).toHaveLength(1);
      expect(body.data.workOverviews[0].skills[0].topicId).toBe(topic.id);
      expect(body.data.workOverviews[0].industries).toHaveLength(1);
      expect(body.data.workOverviews[0].industries[0].industryId).toBe(
        industry.id,
      );
    });

    it("should keep skills and industries when omitted from update", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const topic = await createTestTopic(httpServer, authCookie);
      const industry = await createTestIndustry(httpServer, authCookie);

      await auth(httpServer.put("/profile/work-overview"))
        .send({
          ...getWorkOverviewPayload(),
          skills: [topic.id],
          industries: [industry.id],
        })
        .expect(204);

      await auth(httpServer.put("/profile/work-overview"))
        .send({ title: "Updated Title" })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.workOverviews[0].title).toBe("Updated Title");
      expect(body.data.workOverviews[0].skills[0].topicId).toBe(topic.id);
      expect(body.data.workOverviews[0].industries[0].industryId).toBe(
        industry.id,
      );
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

    it("should preserve omitted fields when updating an experience by id", async () => {
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
      const originalResponsibilities: string | null =
        firstGet.data.workExperiences[0].responsibilities;
      const originalEndDate: string | null =
        firstGet.data.workExperiences[0].endDate;

      await auth(httpServer.put("/profile/work-experience"))
        .send({
          experiences: [
            {
              id: expId,
              company: "Partial Update Co",
              title: "Partial Update Role",
              startDate: "2020-01",
              isCurrent: true,
            },
          ],
        })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.workExperiences).toHaveLength(1);
      expect(secondGet.data.workExperiences[0].company).toBe(
        "Partial Update Co",
      );
      expect(secondGet.data.workExperiences[0].responsibilities).toBe(
        originalResponsibilities,
      );
      expect(secondGet.data.workExperiences[0].endDate).toBe(originalEndDate);
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

    it("should preserve omitted fields when updating education by id", async () => {
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
      expect(firstGet.data.educations[0].fieldOfStudy).toBe(edu.fieldOfStudy);
      expect(firstGet.data.educations[0].country).toBe(edu.country);

      await auth(httpServer.put("/profile/education"))
        .send({
          education: [
            { id: eduId, degreeName: "PhD", institution: "New University" },
          ],
        })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.educations).toHaveLength(1);
      expect(secondGet.data.educations[0].degreeName).toBe("PhD");
      expect(secondGet.data.educations[0].fieldOfStudy).toBe(edu.fieldOfStudy);
      expect(secondGet.data.educations[0].country).toBe(edu.country);
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

  describe("PUT /profile/publications", () => {
    it("should preserve omitted fields when updating a publication by id", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const publication = {
        title: "A Publication",
        year: 2021,
        publicationType: "journal",
        link: "https://example.com/publication",
      };
      await auth(httpServer.put("/profile/publications"))
        .send({ publications: [publication] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const publicationId: number = firstGet.data.publications[0].id;
      expect(firstGet.data.publications[0].year).toBe(publication.year);
      expect(firstGet.data.publications[0].publicationType).toBe(
        publication.publicationType,
      );

      await auth(httpServer.put("/profile/publications"))
        .send({ publications: [{ id: publicationId, title: "Renamed" }] })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.publications).toHaveLength(1);
      expect(secondGet.data.publications[0].id).toBe(publicationId);
      expect(secondGet.data.publications[0].title).toBe("Renamed");
      expect(secondGet.data.publications[0].year).toBe(publication.year);
      expect(secondGet.data.publications[0].publicationType).toBe(
        publication.publicationType,
      );
      expect(secondGet.data.publications[0].link).toBe(publication.link);
    });

    it("should add publications with authors", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const publication = getPublicationPayload();
      await auth(httpServer.put("/profile/publications"))
        .send({ publications: [publication] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.publications).toHaveLength(1);
      expect(body.data.publications[0]).toMatchObject(
        expectedPublicationStructure(),
      );
      expect(body.data.publications[0].title).toBe(publication.title);
      expect(body.data.publications[0].authors).toEqual(publication.authors);
      expect(body.data.publications[0].year).toBe(publication.year);
      expect(body.data.publications[0].publicationType).toBe(
        publication.publicationType,
      );
      expect(body.data.publications[0].notes).toBe(publication.notes);
    });

    it("should delete publications omitted from the array", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      await auth(httpServer.put("/profile/publications"))
        .send({
          publications: [getPublicationPayload(), getPublicationPayload()],
        })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const keepId: number = firstGet.data.publications[0].id;

      await auth(httpServer.put("/profile/publications"))
        .send({ publications: [{ id: keepId, title: "Kept" }] })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.publications).toHaveLength(1);
      expect(secondGet.data.publications[0].id).toBe(keepId);
    });

    it("should clear all publications when empty array is sent", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      await auth(httpServer.put("/profile/publications"))
        .send({ publications: [getPublicationPayload()] })
        .expect(204);

      await auth(httpServer.put("/profile/publications"))
        .send({ publications: [] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.publications).toHaveLength(0);
    });

    it("should return 400 for invalid payload", async () => {
      await auth(httpServer.put("/profile/publications"))
        .send({ publications: [{ title: "" }] })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .put("/profile/publications")
        .send({ publications: [getPublicationPayload()] })
        .expect(401);
    });
  });

  describe("PUT /profile/references", () => {
    it("should add references", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const reference = getReferencePayload();
      await auth(httpServer.put("/profile/references"))
        .send({ references: [reference] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.references).toHaveLength(1);
      expect(body.data.references[0]).toMatchObject(
        expectedReferenceStructure(),
      );
      expect(body.data.references[0].name).toBe(reference.name);
      expect(body.data.references[0].title).toBe(reference.title);
      expect(body.data.references[0].relationType).toBe(reference.relationType);
    });

    it("should preserve omitted fields when updating a reference by id", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const reference = getReferencePayload();
      await auth(httpServer.put("/profile/references"))
        .send({ references: [reference] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const referenceId: number = firstGet.data.references[0].id;
      const originalTitle: string | null = firstGet.data.references[0].title;
      const originalCompany: string | null =
        firstGet.data.references[0].company;
      const originalRelationType: string | null =
        firstGet.data.references[0].relationType;

      await auth(httpServer.put("/profile/references"))
        .send({ references: [{ id: referenceId, name: "Renamed" }] })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.references).toHaveLength(1);
      expect(secondGet.data.references[0].id).toBe(referenceId);
      expect(secondGet.data.references[0].name).toBe("Renamed");
      expect(secondGet.data.references[0].title).toBe(originalTitle);
      expect(secondGet.data.references[0].company).toBe(originalCompany);
      expect(secondGet.data.references[0].relationType).toBe(
        originalRelationType,
      );
    });

    it("should delete references omitted from the array", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      await auth(httpServer.put("/profile/references"))
        .send({ references: [getReferencePayload(), getReferencePayload()] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const keepId: number = firstGet.data.references[0].id;

      await auth(httpServer.put("/profile/references"))
        .send({ references: [{ id: keepId, name: "Kept" }] })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.references).toHaveLength(1);
      expect(secondGet.data.references[0].id).toBe(keepId);
    });

    it("should clear all references when empty array is sent", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      await auth(httpServer.put("/profile/references"))
        .send({ references: [getReferencePayload()] })
        .expect(204);

      await auth(httpServer.put("/profile/references"))
        .send({ references: [] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.references).toHaveLength(0);
    });

    it("should return 400 for invalid payload", async () => {
      await auth(httpServer.put("/profile/references"))
        .send({ references: [{ title: "No Name" }] })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .put("/profile/references")
        .send({ references: [getReferencePayload()] })
        .expect(401);
    });
  });

  describe("PUT /profile/activities", () => {
    it("should add activities", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const activity = getActivityPayload();
      await auth(httpServer.put("/profile/activities"))
        .send({ activities: [activity] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.activities).toHaveLength(1);
      expect(body.data.activities[0]).toMatchObject(
        expectedActivityStructure(),
      );
      expect(body.data.activities[0].name).toBe(activity.name);
      expect(body.data.activities[0].organization).toBe(activity.organization);
      expect(body.data.activities[0].position).toBe(activity.position);
      expect(body.data.activities[0].isCurrent).toBe(activity.isCurrent);
    });

    it("should preserve omitted fields when updating an activity by id", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const activity = getActivityPayload();
      await auth(httpServer.put("/profile/activities"))
        .send({ activities: [activity] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const activityId: number = firstGet.data.activities[0].id;
      const originalOrganization: string | null =
        firstGet.data.activities[0].organization;
      const originalPosition: string | null =
        firstGet.data.activities[0].position;
      const originalNotes: string | null = firstGet.data.activities[0].notes;
      const originalEndDate: string | null =
        firstGet.data.activities[0].endDate;

      await auth(httpServer.put("/profile/activities"))
        .send({
          activities: [
            { id: activityId, name: "Renamed Activity", isCurrent: true },
          ],
        })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.activities).toHaveLength(1);
      expect(secondGet.data.activities[0].name).toBe("Renamed Activity");
      expect(secondGet.data.activities[0].organization).toBe(
        originalOrganization,
      );
      expect(secondGet.data.activities[0].position).toBe(originalPosition);
      expect(secondGet.data.activities[0].notes).toBe(originalNotes);
      expect(secondGet.data.activities[0].endDate).toBe(originalEndDate);
    });

    it("should delete activities omitted from the array", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      await auth(httpServer.put("/profile/activities"))
        .send({ activities: [getActivityPayload(), getActivityPayload()] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const keepId: number = firstGet.data.activities[0].id;

      await auth(httpServer.put("/profile/activities"))
        .send({ activities: [{ id: keepId, name: "Kept", isCurrent: false }] })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.activities).toHaveLength(1);
      expect(secondGet.data.activities[0].id).toBe(keepId);
    });

    it("should clear all activities when empty array is sent", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      await auth(httpServer.put("/profile/activities"))
        .send({ activities: [getActivityPayload()] })
        .expect(204);

      await auth(httpServer.put("/profile/activities"))
        .send({ activities: [] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.activities).toHaveLength(0);
    });

    it("should return 400 for invalid payload", async () => {
      await auth(httpServer.put("/profile/activities"))
        .send({ activities: [{ name: "Missing isCurrent" }] })
        .expect(400);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .put("/profile/activities")
        .send({ activities: [getActivityPayload()] })
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

    it("should sync titles from role ids", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const role = await createTestRole(httpServer, authCookie);
      await auth(httpServer.put("/profile/preferences"))
        .send({ ...getJobPreferencePayload(), titles: [role.id] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      const titles: { roleId: number }[] = body.data.jobPreferences[0].titles;
      const roleIds = titles.map((title) => title.roleId);
      expect(roleIds).toEqual([role.id]);
    });

    it("should replace titles on update", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const role1 = await createTestRole(httpServer, authCookie);
      const role2 = await createTestRole(httpServer, authCookie);

      await auth(httpServer.put("/profile/preferences"))
        .send({ ...getJobPreferencePayload(), titles: [role1.id] })
        .expect(204);
      await auth(httpServer.put("/profile/preferences"))
        .send({ ...getJobPreferencePayload(), titles: [role2.id] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      const titles: { roleId: number }[] = body.data.jobPreferences[0].titles;
      const roleIds = titles.map((title) => title.roleId);
      expect(roleIds).toEqual([role2.id]);
    });

    it("should keep titles when omitted from update", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const role = await createTestRole(httpServer, authCookie);
      await auth(httpServer.put("/profile/preferences"))
        .send({ ...getJobPreferencePayload(), titles: [role.id] })
        .expect(204);

      await auth(httpServer.put("/profile/preferences"))
        .send({ workType: "hybrid" })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      const titles: { roleId: number }[] = body.data.jobPreferences[0].titles;
      const roleIds = titles.map((title) => title.roleId);
      expect(roleIds).toEqual([role.id]);
    });

    it("should clear titles when empty array is sent", async () => {
      const profilePayload = getProfilePayload();
      await auth(httpServer.put("/profile")).send(profilePayload).expect(204);

      const role = await createTestRole(httpServer, authCookie);
      await auth(httpServer.put("/profile/preferences"))
        .send({ ...getJobPreferencePayload(), titles: [role.id] })
        .expect(204);

      await auth(httpServer.put("/profile/preferences"))
        .send({ ...getJobPreferencePayload(), titles: [] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.jobPreferences[0].titles).toEqual([]);
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

  describe("PUT /profile/projects", () => {
    it("should create projects with default type project", async () => {
      const project = getProjectPayload();

      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [project] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.projects).toHaveLength(1);
      expect(body.data.projects[0]).toMatchObject(expectedProjectStructure());
      expect(body.data.projects[0].name).toBe(project.name);
      expect(body.data.projects[0].type).toBe("project");
      expect(body.data.projects[0].link).toBe(project.link);
    });

    it("should create a project with explicit research type", async () => {
      const project = { ...getProjectPayload(), type: "research" };

      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [project] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.projects[0].type).toBe("research");
    });

    it("should sync skills from topic ids", async () => {
      const topic1 = await createTestTopic(httpServer, authCookie);
      const topic2 = await createTestTopic(httpServer, authCookie);
      const project = getProjectPayload([topic1.id, topic2.id]);

      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [project] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      const created: { skills: { topic: { id: number } }[] } =
        body.data.projects[0];
      expect(created.skills).toHaveLength(2);
      const skillTopicIds = created.skills.map((skill) => skill.topic.id);
      expect(skillTopicIds).toEqual(
        expect.arrayContaining([topic1.id, topic2.id]),
      );
    });

    it("should update an existing project by id", async () => {
      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [{ name: "Old Name", type: "research" }] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const projectId: number = firstGet.data.projects[0].id;

      await auth(httpServer.put("/profile/projects"))
        .send({
          projects: [
            {
              id: projectId,
              name: "New Name",
              type: "project",
              description: "Updated description",
            },
          ],
        })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.projects).toHaveLength(1);
      expect(secondGet.data.projects[0].id).toBe(projectId);
      expect(secondGet.data.projects[0].name).toBe("New Name");
      expect(secondGet.data.projects[0].type).toBe("project");
    });

    it("should preserve omitted fields when updating a project by id", async () => {
      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [{ name: "Research Project", type: "research" }] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const projectId: number = firstGet.data.projects[0].id;
      expect(firstGet.data.projects[0].type).toBe("research");

      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [{ id: projectId, name: "Renamed Project" }] })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.projects).toHaveLength(1);
      expect(secondGet.data.projects[0].id).toBe(projectId);
      expect(secondGet.data.projects[0].name).toBe("Renamed Project");
      expect(secondGet.data.projects[0].description).toBe(
        firstGet.data.projects[0].description,
      );
      expect(secondGet.data.projects[0].link).toBe(
        firstGet.data.projects[0].link,
      );
    });

    it("should delete projects omitted from the array", async () => {
      await auth(httpServer.put("/profile/projects"))
        .send({
          projects: [{ name: "Keep Me" }, { name: "Delete Me" }],
        })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const keepId: number = firstGet.data.projects[0].id;

      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [{ id: keepId, name: "Keep Me" }] })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.projects).toHaveLength(1);
      expect(secondGet.data.projects[0].id).toBe(keepId);
    });

    it("should keep existing skills when omitted from update", async () => {
      const topic = await createTestTopic(httpServer, authCookie);

      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [{ name: "With Skills", skills: [topic.id] }] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const projectId: number = firstGet.data.projects[0].id;
      expect(firstGet.data.projects[0].skills).toHaveLength(1);

      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [{ id: projectId, name: "With Skills" }] })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.projects[0].skills).toHaveLength(1);
    });

    it("should clear project skills when an empty array is sent", async () => {
      const topic = await createTestTopic(httpServer, authCookie);

      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [{ name: "With Skills", skills: [topic.id] }] })
        .expect(204);

      const { body: firstGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      const projectId: number = firstGet.data.projects[0].id;
      expect(firstGet.data.projects[0].skills).toHaveLength(1);

      await auth(httpServer.put("/profile/projects"))
        .send({
          projects: [{ id: projectId, name: "With Skills", skills: [] }],
        })
        .expect(204);

      const { body: secondGet } = await auth(httpServer.get("/profile")).expect(
        200,
      );
      expect(secondGet.data.projects[0].skills).toHaveLength(0);
    });

    it("should return 400 for invalid payload", async () => {
      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [{ name: "" }] })
        .expect(400);
    });

    it("should return 400 for invalid project type", async () => {
      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [{ name: "Bad", type: "side-hustle" }] })
        .expect(400);
    });

    it("should clear all projects when empty array is sent", async () => {
      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [{ name: "Only One" }] })
        .expect(204);

      await auth(httpServer.put("/profile/projects"))
        .send({ projects: [] })
        .expect(204);

      const { body } = await auth(httpServer.get("/profile")).expect(200);
      expect(body.data.projects).toHaveLength(0);
    });

    it("should return 401 without auth cookie in web mode", async () => {
      if (isAppMode) return;

      await httpServer
        .put("/profile/projects")
        .send({ projects: [{ name: "Unauthorized" }] })
        .expect(401);
    });
  });
});
