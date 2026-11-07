import { describe, expect, it } from "vitest";

import { hashListing } from "../crawl.constants";
import {
  extractAnchors,
  extractJobPostingDescription,
  extractJobPostings,
  extractMainText,
  htmlToText,
  htmlToTextOfEscaped,
  scrapeListing,
} from "../crawl.scrape";

const BASE = "https://careers.example.com/jobs";

const posting = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Backend Engineer",
  url: "https://careers.example.com/jobs/backend?utm_source=feed",
  identifier: { "@type": "PropertyValue", value: "gh-42" },
  jobLocation: { address: { addressLocality: "Berlin", addressCountry: "DE" } },
  description: "<p>Build <strong>APIs</strong>.</p>",
};

describe("htmlToText", () => {
  it("drops noise elements, comments and attributes", () => {
    const html = `
      <!-- hidden -->
      <style>body { color: red }</style>
      <script>alert("x")</script>
      <noscript>enable js</noscript>
      <iframe src="https://evil.test"></iframe>
      <object data="x"></object>
      <embed src="y" />
      <form><input value="secret"></form>
      <p onclick="steal()">Hello &amp; welcome</p>
    `;

    const text = htmlToText(html);

    expect(text).toBe("Hello & welcome");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("enable js");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("onclick");
  });

  it("collapses whitespace and strips NUL bytes", () => {
    expect(htmlToText("<div>a\u0000   b</div>")).toBe("a b");
    expect(htmlToText("<p>one</p><p>two</p>")).toBe("one\n\ntwo");
  });

  it("keeps angle brackets that were escaped in the source", () => {
    expect(htmlToText("<p>Use List&lt;String&gt; here</p>")).toBe(
      "Use List<String> here",
    );
  });

  it("parses hostile unclosed tags without stalling", () => {
    const html = "<a ".repeat(50_000) + "<script ".repeat(50_000);
    const started = Date.now();

    htmlToText(html);
    extractAnchors(html, BASE);

    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe("htmlToTextOfEscaped", () => {
  it("decodes HTML-escaped HTML from a board", () => {
    expect(htmlToTextOfEscaped("&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;")).toBe(
      "Build & ship",
    );
  });

  it("leaves plain text alone", () => {
    expect(htmlToTextOfEscaped("Use List&lt;String&gt; here")).toBe(
      "Use List<String> here",
    );
  });
});

describe("extractMainText", () => {
  it("returns the main element only", () => {
    const html = `<html><body><nav>Menu</nav><main><p>Body</p></main><footer>Foot</footer></body></html>`;
    expect(extractMainText(html)).toBe("Body");
  });

  it("returns null without a main or article element", () => {
    expect(extractMainText("<html><body><p>Body</p></body></html>")).toBeNull();
  });
});

describe("extractJobPostings", () => {
  it("finds JobPosting nodes nested in @graph", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "WebSite" }, posting],
    })}</script>`;

    expect(extractJobPostings(html)).toHaveLength(1);
  });

  it("ignores broken JSON blocks", () => {
    const html = `<script type="application/ld+json">{ not json </script>`;
    expect(extractJobPostings(html)).toEqual([]);
  });

  it("extracts the sanitized description", () => {
    const html = `<script type="application/ld+json">${JSON.stringify(
      posting,
    )}</script>`;

    expect(extractJobPostingDescription(html)).toBe("Build APIs.");
  });
});

describe("extractAnchors", () => {
  it("keeps same-host job links and drops everything else", () => {
    const html = `
      <a href="/jobs/backend-engineer">Backend</a>
      <a href="https://careers.example.com/jobs/frontend?utm_source=x">Frontend</a>
      <a href="https://evil.test/jobs/backend">External</a>
      <a href="/blog/hiring">Blog</a>
      <a href="#top">Top</a>
      <a href="mailto:jobs@example.com">Mail</a>
    `;

    const anchors = extractAnchors(html, BASE);

    expect(anchors).toEqual([
      {
        url: "https://careers.example.com/jobs/backend-engineer",
        title: "Backend",
      },
      { url: "https://careers.example.com/jobs/frontend", title: "Frontend" },
    ]);
  });

  it("ignores the listing page and bare nav links", () => {
    const html = `
      <a href="/jobs">Jobs</a>
      <a href="/jobs/">All jobs</a>
      <a href="/careers">Careers</a>
      <a href="/apply">Apply</a>
      <a href="/jobs/backend">Backend</a>
    `;

    expect(extractAnchors(html, BASE)).toEqual([
      {
        url: "https://careers.example.com/jobs/backend",
        title: "Backend",
      },
    ]);
  });

  it("returns every same-host link in anyPath mode", () => {
    const html = `
      <a href="/careers">Careers</a>
      <a href="/team">Team</a>
      <a href="https://evil.test/team">External</a>
      <a href="/jobs/backend">Backend</a>
    `;

    expect(extractAnchors(html, BASE, true)).toEqual([
      { url: "https://careers.example.com/careers", title: "Careers" },
      { url: "https://careers.example.com/team", title: "Team" },
      { url: "https://careers.example.com/jobs/backend", title: "Backend" },
    ]);
  });

  it("keeps embedded-board links that share the listing path", () => {
    const html = `
      <a href="/careers?gh_jid=123">Backend</a>
      <a href="/careers?gh_jid=456">Frontend</a>
      <a href="/careers?ref=nav">All jobs</a>
    `;

    expect(extractAnchors(html, "https://acme.test/careers")).toEqual([
      { url: "https://acme.test/careers?gh_jid=123", title: "Backend" },
      { url: "https://acme.test/careers?gh_jid=456", title: "Frontend" },
    ]);
  });

  it("deduplicates repeated links", () => {
    const html = `
      <a href="/jobs/a">A</a>
      <a href="/jobs/a">A again</a>
    `;

    expect(extractAnchors(html, BASE)).toHaveLength(1);
  });

  it("stops at the depth cap instead of overflowing the stack", () => {
    const html = "<div>".repeat(50_000) + "<a href='/jobs/a'>A</a>";

    expect(extractAnchors(html, BASE)).toEqual([]);
  });
});

describe("scrapeListing", () => {
  it("combines JSON-LD postings with anchors", () => {
    const html = `
      <script type="application/ld+json">${JSON.stringify(posting)}</script>
      <a href="/jobs/designer">Designer</a>
      <a href="/jobs/backend">Backend duplicate</a>
    `;

    const items = scrapeListing(html, BASE);

    expect(items).toEqual([
      {
        externalId: "gh-42",
        url: "https://careers.example.com/jobs/backend",
        title: "Backend Engineer",
        location: "Berlin, DE",
        description: "Build APIs.",
      },
      {
        externalId: null,
        url: "https://careers.example.com/jobs/designer",
        title: "Designer",
        location: null,
        description: null,
      },
    ]);
  });

  it("drops JSON-LD postings that point at another host", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      ...posting,
      url: "https://evil.test/jobs/backend",
    })}</script>`;

    expect(scrapeListing(html, BASE)).toEqual([]);
  });
});

describe("hashListing", () => {
  const item = {
    externalId: "1",
    url: "https://careers.example.com/jobs/a",
    title: "A",
    location: null,
    description: "one",
  };

  it("is independent of listing order and description", () => {
    const other = {
      ...item,
      externalId: "2",
      url: "https://careers.example.com/jobs/b",
    };

    expect(hashListing([item, other])).toBe(hashListing([other, item]));
    expect(hashListing([{ ...item, description: "changed" }])).toBe(
      hashListing([item]),
    );
  });

  it("changes when a URL changes", () => {
    expect(hashListing([item])).not.toBe(
      hashListing([{ ...item, url: "https://careers.example.com/jobs/c" }]),
    );
  });
});
