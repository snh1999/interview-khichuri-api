import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IDatabaseService } from "@/src/database/database.service";

import type {
  ActivitiesDto,
  ProjectsDto,
  PublicationsDto,
  ReferencesDto,
} from "./profile.dto";
import { ProfileService } from "./profile.service";

describe("ProfileService", () => {
  let service: ProfileService;
  const mockTransaction = {};
  const mockDb = {
    create: vi.fn(),
    createMany: vi.fn(),
    findAllByColumn: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    syncJunctionTable: vi.fn(),
    syncOneToMany: vi.fn(),
    withTransaction: vi.fn((cb: (tx: unknown) => unknown) =>
      cb(mockTransaction),
    ),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: IDatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get(ProfileService);
  });

  describe("findProfile", () => {
    it("should deserialize publication authors", async () => {
      mockDb.findAllByColumn.mockResolvedValue([
        {
          id: "user-1",
          firstName: "John",
          lastName: "Doe",
          phone: null,
          email: null,
          location: null,
          country: null,
          links: [],
          workOverviews: [],
          workExperiences: [],
          educations: [],
          jobPreferences: [],
          publications: [{ id: "pub1", authors: '["A","B"]' }],
          projects: [],
          references: [],
          activities: [],
        },
      ]);

      const result = await service.findProfile({
        id: "user-1",
        name: "John",
        email: "john@example.com",
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(result.publications[0].authors).toEqual(["A", "B"]);
    });

    it("should include the new sections in the empty profile fallback", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);
      mockDb.create.mockResolvedValue({
        id: "user-1",
        firstName: "John",
      });

      const result = await service.findProfile({
        id: "user-1",
        name: "John",
        email: "john@example.com",
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(result).toEqual(
        expect.objectContaining({
          publications: [],
          projects: [],
          references: [],
          activities: [],
        }),
      );
    });
  });

  describe("updatePublications", () => {
    it("should serialize authors as JSON when syncing", async () => {
      const dto: PublicationsDto = {
        publications: [
          {
            title: "A Paper",
            authors: ["Alice", "Bob"],
            notes: null,
            link: null,
            year: null,
            publicationType: null,
          },
        ],
      };

      await service.updatePublications("user-1", dto);

      expect(mockDb.syncOneToMany).toHaveBeenCalledWith(
        "publications",
        { column: "profileId", value: "user-1" },
        [
          expect.objectContaining({
            title: "A Paper",
            authors: '["Alice","Bob"]',
          }),
        ],
        mockTransaction,
      );
    });

    it("should default authors to an empty JSON array", async () => {
      const dto: PublicationsDto = { publications: [{ title: "No authors" }] };

      await service.updatePublications("user-1", dto);

      expect(mockDb.syncOneToMany).toHaveBeenCalledWith(
        "publications",
        { column: "profileId", value: "user-1" },
        [expect.objectContaining({ title: "No authors", authors: "[]" })],
        mockTransaction,
      );
    });
  });

  describe("updateProjects", () => {
    it("should sync projects and junction skills for newly created projects", async () => {
      mockDb.syncOneToMany.mockResolvedValue([1]);

      const dto: ProjectsDto = {
        projects: [
          {
            name: "Project A",
            type: "project",
            description: "Research",
            link: null,
            skills: [1, 2],
          },
        ],
      };

      await service.updateProjects("user-1", dto);

      expect(mockDb.syncOneToMany).toHaveBeenCalledWith(
        "projects",
        { column: "profileId", value: "user-1" },
        [
          {
            name: "Project A",
            type: "project",
            description: "Research",
            link: null,
          },
        ],
        mockTransaction,
      );
      expect(mockDb.syncJunctionTable).toHaveBeenCalledWith(
        "project_skills",
        { column: "projectId", value: 1 },
        "topicId",
        [1, 2],
        mockTransaction,
      );
    });

    it("should update an existing project and sync its skills", async () => {
      mockDb.syncOneToMany.mockResolvedValue([1]);

      const dto: ProjectsDto = {
        projects: [
          {
            id: 1,
            name: "Project A",
            type: "project",
            description: "Updated",
            link: null,
            skills: [3],
          },
        ],
      };

      await service.updateProjects("user-1", dto);

      expect(mockDb.syncOneToMany).toHaveBeenCalledWith(
        "projects",
        { column: "profileId", value: "user-1" },
        [
          {
            id: 1,
            name: "Project A",
            type: "project",
            description: "Updated",
            link: null,
          },
        ],
        mockTransaction,
      );
      expect(mockDb.syncJunctionTable).toHaveBeenCalledWith(
        "project_skills",
        { column: "projectId", value: 1 },
        "topicId",
        [3],
        mockTransaction,
      );
    });

    it("should skip junction sync when skills are not provided", async () => {
      mockDb.syncOneToMany.mockResolvedValue([1]);

      const dto: ProjectsDto = {
        projects: [{ id: 1, name: "Project A" }],
      };

      await service.updateProjects("user-1", dto);

      expect(mockDb.syncOneToMany).toHaveBeenCalledWith(
        "projects",
        { column: "profileId", value: "user-1" },
        [{ id: 1, name: "Project A" }],
        mockTransaction,
      );
      expect(mockDb.syncJunctionTable).not.toHaveBeenCalled();
    });

    it("should map junction skills to each project by returned id", async () => {
      mockDb.syncOneToMany.mockResolvedValue([1, 2]);

      const dto: ProjectsDto = {
        projects: [
          {
            name: "Project A",
            type: "project",
            skills: [1],
          },
          {
            name: "Project B",
            type: "project",
            skills: [2, 3],
          },
        ],
      };

      await service.updateProjects("user-1", dto);

      expect(mockDb.syncJunctionTable).toHaveBeenNthCalledWith(
        1,
        "project_skills",
        { column: "projectId", value: 1 },
        "topicId",
        [1],
        mockTransaction,
      );
      expect(mockDb.syncJunctionTable).toHaveBeenNthCalledWith(
        2,
        "project_skills",
        { column: "projectId", value: 2 },
        "topicId",
        [2, 3],
        mockTransaction,
      );
    });
  });

  describe("updateWorkOverview", () => {
    it("should sync skills and industries when provided", async () => {
      mockDb.findAllByColumn.mockResolvedValue([
        { id: 1, profileId: "user-1" },
      ]);

      await service.updateWorkOverview("user-1", {
        title: "Engineer",
        skills: [10, 11],
        industries: [5],
      });

      expect(mockDb.syncJunctionTable).toHaveBeenCalledWith(
        "work_skills",
        { column: "workId", value: 1 },
        "topicId",
        [10, 11],
        mockTransaction,
      );
      expect(mockDb.syncJunctionTable).toHaveBeenCalledWith(
        "work_industries",
        { column: "workId", value: 1 },
        "industryId",
        [5],
        mockTransaction,
      );
    });

    it("should not sync skills when neither skills nor industries are provided", async () => {
      mockDb.findAllByColumn.mockResolvedValue([
        { id: 1, profileId: "user-1" },
      ]);

      await service.updateWorkOverview("user-1", {
        title: "Updated Title",
      });

      expect(mockDb.syncJunctionTable).not.toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalledWith(
        "work_overview",
        { title: "Updated Title" },
        { id: 1 },
        mockTransaction,
      );
    });
  });

  describe("updateReferences", () => {
    it("should sync references for the user", async () => {
      const dto: ReferencesDto = {
        references: [
          {
            name: "Jane",
            title: "Manager",
            company: "Acme",
            email: null,
            phone: null,
            relationType: "manager",
            notes: null,
          },
        ],
      };

      await service.updateReferences("user-1", dto);

      expect(mockDb.syncOneToMany).toHaveBeenCalledWith(
        "references",
        { column: "profileId", value: "user-1" },
        dto.references,
        mockTransaction,
      );
    });
  });

  describe("updateActivities", () => {
    it("should sync activities for the user", async () => {
      const dto: ActivitiesDto = {
        activities: [
          {
            name: "Volunteer",
            organization: "Charity",
            position: null,
            startDate: null,
            endDate: null,
            isCurrent: true,
            notes: null,
          },
        ],
      };

      await service.updateActivities("user-1", dto);

      expect(mockDb.syncOneToMany).toHaveBeenCalledWith(
        "activities",
        { column: "profileId", value: "user-1" },
        dto.activities,
        mockTransaction,
      );
    });
  });
});
