import { describe, expect, it, vi } from "vitest";

import type { TCompany } from "@/src/database/database.types";

import { fetchAtsListing } from "../crawl.ats";

const companyOf = (overrides: Partial<TCompany> = {}): TCompany =>
  ({
    id: 1,
    name: "Acme",
    provider: "greenhouse",
    atsBoardId: "acme",
    careerPageUrl: null,
    ...overrides,
  }) as TCompany;

const fetchPageOf = (payload: unknown) =>
  vi.fn().mockResolvedValue({ text: JSON.stringify(payload) });

describe("fetchAtsListing", () => {
  it("maps a greenhouse board", async () => {
    const fetchPage = fetchPageOf({
      jobs: [
        {
          id: 101,
          title: "Backend Engineer",
          absolute_url: "https://boards.greenhouse.io/acme/jobs/101?gh_src=x",
          location: { name: "Remote" },
          content: "<p>Build &amp; ship APIs</p><script>x</script>",
        },
      ],
    });

    await expect(fetchAtsListing(companyOf(), fetchPage)).resolves.toEqual([
      {
        externalId: "101",
        url: "https://boards.greenhouse.io/acme/jobs/101",
        title: "Backend Engineer",
        location: "Remote",
        description: "Build & ship APIs",
      },
    ]);
    expect(fetchPage).toHaveBeenCalledWith(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true",
    );
  });

  it("decodes a double-encoded greenhouse content field", async () => {
    const fetchPage = fetchPageOf({
      jobs: [
        {
          id: 102,
          title: "Engineer",
          absolute_url: "https://boards.greenhouse.io/acme/jobs/102",
          location: { name: "Remote" },
          content:
            "&lt;div class=&quot;content&quot;&gt;&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;&lt;/div&gt;",
        },
      ],
    });

    const [item] = await fetchAtsListing(companyOf(), fetchPage);

    expect(item.description).toBe("Build & ship");
  });

  it("maps a lever board", async () => {
    const fetchPage = fetchPageOf([
      {
        id: "lever-1",
        text: "Designer",
        hostedUrl: "https://jobs.lever.co/acme/lever-1",
        categories: { location: "Berlin" },
        descriptionPlain: "Design things",
        lists: [
          { text: "Responsibilities", content: "<li>Own the design</li>" },
          { text: "Requirements", content: "<li>5 years</li>" },
        ],
        additionalPlain: "Perks apply",
      },
    ]);

    const items = await fetchAtsListing(
      companyOf({ provider: "lever" }),
      fetchPage,
    );

    expect(items).toEqual([
      {
        externalId: "lever-1",
        url: "https://jobs.lever.co/acme/lever-1",
        title: "Designer",
        location: "Berlin",
        description:
          "Design things\n\nOwn the design\n\n5 years\n\nPerks apply",
      },
    ]);
  });

  it("maps an ashby board", async () => {
    const fetchPage = fetchPageOf({
      jobs: [
        {
          id: "ashby-1",
          title: "PM",
          jobUrl: "https://jobs.ashbyhq.com/acme/ashby-1",
          location: "Remote",
          descriptionHtml: "<p>Own the roadmap</p>",
        },
      ],
    });

    const items = await fetchAtsListing(
      companyOf({ provider: "ashby" }),
      fetchPage,
    );

    expect(items[0]).toMatchObject({
      externalId: "ashby-1",
      description: "Own the roadmap",
    });
  });

  it("skips unlisted ashby postings", async () => {
    const fetchPage = fetchPageOf({
      jobs: [
        {
          id: "ashby-1",
          title: "Public",
          jobUrl: "https://jobs.ashbyhq.com/acme/ashby-1",
          isListed: true,
        },
        {
          id: "ashby-2",
          title: "Hidden",
          jobUrl: "https://jobs.ashbyhq.com/acme/ashby-2",
          isListed: false,
        },
      ],
    });

    const items = await fetchAtsListing(
      companyOf({ provider: "ashby" }),
      fetchPage,
    );

    expect(items.map((item) => item.externalId)).toEqual(["ashby-1"]);
  });

  it("returns an empty list for a valid empty board", async () => {
    const fetchPage = fetchPageOf({ jobs: [] });

    await expect(fetchAtsListing(companyOf(), fetchPage)).resolves.toEqual([]);
  });

  it("rejects a board payload without a jobs array", async () => {
    const fetchPage = fetchPageOf({ error: "not found" });

    await expect(fetchAtsListing(companyOf(), fetchPage)).rejects.toThrow(
      "invalid payload",
    );
  });

  it("fails the crawl when an ATS row has no external id", async () => {
    const fetchPage = fetchPageOf({
      jobs: [{ title: "Ghost", absolute_url: "https://x.test/jobs/1" }],
    });

    await expect(fetchAtsListing(companyOf(), fetchPage)).rejects.toThrow(
      "missing an external id",
    );
  });

  it("fails the crawl on an invalid job URL", async () => {
    const fetchPage = fetchPageOf({
      jobs: [{ id: 1, title: "Bad", absolute_url: "javascript:alert(1)" }],
    });

    await expect(fetchAtsListing(companyOf(), fetchPage)).rejects.toThrow(
      "invalid job URL",
    );
  });

  it("rejects a board id that is not a slug", async () => {
    const fetchPage = fetchPageOf({ jobs: [] });

    for (const atsBoardId of [
      "../../etc/passwd",
      "acme@evil.com",
      "acme.example.com",
    ]) {
      await expect(
        fetchAtsListing(companyOf({ atsBoardId }), fetchPage),
      ).rejects.toThrow("no valid ATS board id");
    }
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("fails a non-ATS provider", async () => {
    const fetchPage = fetchPageOf({ jobs: [] });

    await expect(
      fetchAtsListing(companyOf({ provider: "scrape" }), fetchPage),
    ).rejects.toThrow("not configured for an ATS provider");
  });

  it("fails on invalid JSON", async () => {
    const fetchPage = vi.fn().mockResolvedValue({ text: "<html>" });

    await expect(fetchAtsListing(companyOf(), fetchPage)).rejects.toThrow(
      "invalid JSON",
    );
  });
});
