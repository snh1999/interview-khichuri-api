import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("unpdf", () => ({
  extractText: vi.fn().mockResolvedValue({ text: "resume text" }),
}));

import { IDatabaseService } from "@/src/database/database.service";
import { GenAiService } from "@/src/gen-ai/gen-ai.service";
import { LookupsService } from "@/src/lookups/lookups.service";
import type { TResumeContent } from "@/src/resume/resume.dto";
import { FileUploadService } from "@/src/utilities/upload/file-upload.service";

import { ResumeService } from "./resume.service";

function makeContent(): TResumeContent {
  return {
    personal: {
      firstName: "John",
      lastName: "Doe",
      phone: null,
      email: null,
      location: null,
      country: null,
    },
    professional: {
      title: "Engineer",
      experienceLevel: null,
      yearsOfExperience: null,
      skills: [],
      industries: [],
    },
    workExperience: [],
    education: [],
    preferences: {
      workType: null,
      salaryLower: null,
      salaryExpected: null,
      currency: "USD",
      preferredLocation: null,
      titles: [],
    },
    links: [],
    publications: [],
    projects: [],
    references: [],
    activities: [],
  };
}

describe("ResumeService", () => {
  let service: ResumeService;
  const mockDb = {
    create: vi.fn(),
    findAllByColumn: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const mockFileService = {
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    downloadFile: vi.fn(),
    getSignedUrl: vi.fn(),
  };
  const mockGenAiService = {
    extractResume: vi.fn(),
  };
  const mockLookupsService = {
    resolveOrCreateNames: vi.fn().mockResolvedValue([]),
    resolveNameIds: vi.fn().mockResolvedValue([]),
    resolveOrCreateName: vi.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ResumeService,
        { provide: IDatabaseService, useValue: mockDb },
        { provide: FileUploadService, useValue: mockFileService },
        { provide: GenAiService, useValue: mockGenAiService },
        { provide: LookupsService, useValue: mockLookupsService },
      ],
    }).compile();

    service = module.get(ResumeService);
  });

  describe("findAll", () => {
    it("should call db.findAllByColumn with profileId filter", async () => {
      const resumes = [{ id: "r1" }];
      mockDb.findAllByColumn.mockResolvedValue(resumes);

      const result = await service.findAll("user-1");

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("resume", {
        filter: { profileId: "user-1" },
      });
      expect(result).toEqual([{ id: "r1", content: null }]);
    });
  });

  describe("findById", () => {
    it("should call db.findById with resume id and profileId filter", async () => {
      const resume = { id: "r1" };
      mockDb.findById.mockResolvedValue(resume);

      const result = await service.findById("r1", "user-1");

      expect(mockDb.findById).toHaveBeenCalledWith("resume", "r1", {
        filter: { profileId: "user-1" },
      });
      expect(result).toEqual({ id: "r1", content: null });
    });

    it("should throw NotFoundException when resume is missing", async () => {
      mockDb.findById.mockRejectedValue(
        new NotFoundException("resume r1 not found"),
      );

      await expect(service.findById("r1", "user-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findBySlug", () => {
    it("should find a public resume by slug", async () => {
      const resume = { id: "r1", slug: "my-resume" };
      mockDb.findAllByColumn.mockResolvedValue([resume]);

      const result = await service.findBySlug("my-resume");

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("resume", {
        filter: { slug: "my-resume", isPublic: true },
      });
      expect(result).toEqual({ ...resume, content: null });
    });

    it("should throw NotFoundException when no public resume matches", async () => {
      mockDb.findAllByColumn.mockResolvedValue([]);

      await expect(service.findBySlug("missing")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("createFromContent", () => {
    it("should create a resume from provided content", async () => {
      const content = makeContent();
      mockDb.findAllByColumn.mockResolvedValue([]);
      const created = { id: "r1", name: "My Resume" };
      mockDb.create.mockResolvedValue(created);

      const result = await service.create("user-1", {
        name: "  My Resume  ",
        content,
      });

      expect(mockDb.findAllByColumn).toHaveBeenCalledWith("resume", {
        filter: { profileId: "user-1" },
      });
      expect(mockDb.create).toHaveBeenCalledWith("resume", {
        profileId: "user-1",
        name: "  My Resume  ",
        content: JSON.stringify(content),
        isPrimary: true,
      });
      expect(result).toEqual({ ...created, content: null });
    });

    it("should use provided template and mark resume non-primary when one exists", async () => {
      mockDb.findAllByColumn.mockResolvedValue([{ id: "existing" }]);
      mockDb.create.mockResolvedValue({ id: "r2" });

      await service.create("user-1", {
        name: "Second",
        content: makeContent(),
        template: "minimal",
      });

      expect(mockDb.create).toHaveBeenCalledWith(
        "resume",
        expect.objectContaining({ template: "minimal", isPrimary: false }),
      );
    });

    it("should throw when the user already has the maximum resumes", async () => {
      mockDb.findAllByColumn.mockResolvedValue([
        { id: "1" },
        { id: "2" },
        { id: "3" },
        { id: "4" },
        { id: "5" },
      ]);

      await expect(
        service.create("user-1", {
          name: "Too many",
          content: makeContent(),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockDb.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("should throw NotFoundException for another user's resume", async () => {
      mockDb.findById.mockRejectedValue(
        new NotFoundException("resume r1 not found"),
      );

      await expect(
        service.update("r1", "user-1", { name: "Nope" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should call db.update with the resume data", async () => {
      mockDb.findById.mockResolvedValue({
        id: "r1",
        profileId: "user-1",
        url: "",
        name: "My Resume",
        template: "professional",
        slug: null,
      });
      const updated = { id: "r1", name: "Renamed" };
      mockDb.update.mockResolvedValue([updated]);

      const result = await service.update("r1", "user-1", { name: "Renamed" });

      expect(mockDb.update).toHaveBeenCalledWith(
        "resume",
        { name: "Renamed", slug: null },
        { id: "r1" },
      );
      expect(result).toEqual({ id: "r1", name: "Renamed", content: null });
    });

    it("should throw BadRequestException when replacing content of a PDF upload", async () => {
      mockDb.findById.mockResolvedValue({
        id: "r1",
        profileId: "user-1",
        url: "resumes/file.pdf",
        name: "My Resume",
        template: "professional",
        slug: null,
      });

      await expect(
        service.update("r1", "user-1", {
          name: "New",
          content: makeContent(),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("should generate a slug when the resume becomes public", async () => {
      mockDb.findById.mockResolvedValue({
        id: "r1",
        profileId: "user-1",
        url: "",
        name: "My Resume",
        template: "professional",
        slug: null,
      });
      mockDb.update.mockResolvedValue([{ id: "r1" }]);

      await service.update("r1", "user-1", { isPublic: true });

      expect(mockDb.update).toHaveBeenCalledWith(
        "resume",
        expect.objectContaining({
          slug: expect.stringMatching(/^my-resume-[0-9a-f]{8}$/),
        }),
        { id: "r1" },
      );
    });
  });

  describe("delete", () => {
    it("should throw NotFoundException for another user's resume", async () => {
      mockDb.findById.mockRejectedValue(
        new NotFoundException("resume r1 not found"),
      );

      await expect(service.delete("r1", "user-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should delete the file and the resume row", async () => {
      mockDb.findById.mockResolvedValue({
        id: "r1",
        profileId: "user-1",
        url: "resumes/file.pdf",
      });
      mockFileService.deleteFile.mockResolvedValue(undefined);
      mockDb.delete.mockResolvedValue(undefined);

      await service.delete("r1", "user-1");

      expect(mockFileService.deleteFile).toHaveBeenCalledWith(
        "resumes/file.pdf",
      );
      expect(mockDb.delete).toHaveBeenCalledWith("resume", { id: "r1" });
    });

    it("should not delete a file when the resume has none", async () => {
      mockDb.findById.mockResolvedValue({
        id: "r1",
        profileId: "user-1",
        url: null,
      });
      mockDb.delete.mockResolvedValue(undefined);

      await service.delete("r1", "user-1");

      expect(mockFileService.deleteFile).not.toHaveBeenCalled();
      expect(mockDb.delete).toHaveBeenCalledWith("resume", { id: "r1" });
    });
  });

  describe("extractResume", () => {
    // Resolved lookup ids are deduplicated, so a skill shared across two
    // projects used to shift every later project's ids onto the wrong skills.
    it("should map project skill ids by name when projects share a skill", async () => {
      mockDb.findById.mockResolvedValue({
        id: "r1",
        profileId: "user-1",
        url: "resumes/file.pdf",
        content: null,
      });
      mockFileService.downloadFile.mockResolvedValue(
        Buffer.from("%PDF-1.4 resume text"),
      );
      mockGenAiService.extractResume.mockResolvedValue({
        ...makeContent(),
        projects: [
          { name: "A", skills: ["React", "Node"] },
          { name: "B", skills: ["react", "GraphQL"] },
        ],
      });
      // Deduplicated: the two "react" entries collapse to one id.
      mockLookupsService.resolveNameIds.mockResolvedValue([
        { name: "react", id: 1 },
        { name: "node", id: 2 },
        { name: "graphql", id: 3 },
      ]);
      mockDb.update.mockResolvedValue([]);

      const result = await service.extractResume("r1", "google", "user-1");

      expect(result.projects).toEqual([
        { name: "A", skills: [1, 2] },
        { name: "B", skills: [1, 3] },
      ]);
      expect(mockDb.update).toHaveBeenCalledWith(
        "resume",
        { content: JSON.stringify(result) },
        { id: "r1" },
      );
    });
  });
});
